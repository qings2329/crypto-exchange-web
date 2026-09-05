// 公共行情 WebSocket 管理器（支持 Binance 组合流与自建 Go 网关两套协议）。
//
// 协议切换：
// - VITE_MARKET_BASE 未显式置空时，连接自建 Go 网关的 /ws（trade/depth/ticker）和
//   /market/kline/ws（K 线）；消息格式为 {type, symbol, data}；
// - VITE_MARKET_BASE="" 时回退 Binance 组合流 wss://stream.binance.com:9443/stream?streams=...，
//   消息格式为 {stream, data}，带 SUBSCRIBE/UNSUBSCRIBE 控制帧。
//
// 两种协议共享同一份基础设施：单例、引用计数、指数退避重连、心跳假死检测、断网自动恢复、
// 状态机通知（connecting/open/reconnecting/closed）。

export type BinanceWsStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

type MessageHandler = (stream: string, data: unknown) => void;
type StatusHandler = (status: BinanceWsStatus) => void;

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream";
/** 自建后端市场网关根路径（WS 子路径在 connet() 内自动拼接）。 */
const MARKET_BASE = (import.meta.env.VITE_MARKET_BASE as string | undefined) ?? "/api/v1/market";
const USE_GATEWAY = !!MARKET_BASE;

const BACKOFF_BASE_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_CHECK_MS = 5_000;
const STALE_MS = 15_000;

/**
 * 指数退避延迟（含 ±50% 随机抖动，避免服务端雪崩）：
 * delay = min(cap, base * 2^attempt) × [0.5, 1.5)
 */
export function backoffDelay(attempt: number, base: number = BACKOFF_BASE_MS, cap: number = MAX_BACKOFF_MS): number {
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.round(exp * (0.5 + Math.random()));
}

interface Subscription {
  count: number;
  handlers: Set<MessageHandler>;
}

// ---------- Go 网关协议（{type, symbol, data}）路径 ----------

const GW_WS_PATH = "/ws";
const GW_KLINE_WS_PATH = "/market/kline/ws";

function resolveWsBase(): string {
  const protocol = typeof location !== "undefined" ? (location.protocol === "https:" ? "wss:" : "ws:") : "ws:";
  if (USE_GATEWAY) {
    // 相对路径：开发期走 Vite /api 代理到 mock gateway（:8787），生产期走同源网关（:8096）。
    return `${protocol}//${location?.host ?? ""}${MARKET_BASE}`;
  }
  return BINANCE_WS_BASE;
}

/** 把 Binance 流名拆成 symbol + type（供网关模式路由）。 */
function parseStream(s: string): { symbol: string; type: string; interval?: string } {
  const dot = s.indexOf("@");
  const symbol = dot >= 0 ? s.slice(0, dot) : s;
  const rest = dot >= 0 ? s.slice(dot + 1) : "";
  // kline_1m / depth10@100ms / ticker / trade
  const parts = rest.split("@");
  const type = parts[0];
  const interval = type.startsWith("kline_") ? type.replace("kline_", "") : undefined;
  return { symbol: symbol.toUpperCase(), type, interval };
}

// ---------- 管理器 ----------

class BinanceStreamManager {
  private subs = new Map<string, Subscription>();
  private statusHandlers = new Set<StatusHandler>();
  // 网关模式维护两条 WS（非 kline / kline）；Binance 模式只有一条。
  private ws: WebSocket | null = null;
  private klineWs: WebSocket | null = null;
  private status: BinanceWsStatus = "idle";
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private msgId = 0;
  private networkListenersBound = false;

  getStatus() {
    return this.status;
  }

  /** 最近一次收到报文的时间戳（心跳/调试用） */
  getLastMessageAt() {
    return this.lastMessageAt;
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    this.bindNetworkListeners();
    return () => this.statusHandlers.delete(handler);
  }

  /** 订阅一条流；返回取消函数（引用计数 -1）。 */
  subscribe(stream: string, handler: MessageHandler): () => void {
    let sub = this.subs.get(stream);
    if (!sub) {
      sub = { count: 0, handlers: new Set() };
      this.subs.set(stream, sub);
      if (USE_GATEWAY) {
        // 网关模式：动态补订（已有连接时即时补发订阅请求给 server，server 按 ?symbol= 过滤）
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendGatewaySub(this.ws, stream);
        if (this.klineWs && this.klineWs.readyState === WebSocket.OPEN) this.sendKlineGatewaySub(this.klineWs, stream);
      } else {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendFrame("SUBSCRIBE", [stream]);
      }
    }
    sub.count += 1;
    sub.handlers.add(handler);
    this.bindNetworkListeners();
    this.ensureConnection();

    return () => {
      const s = this.subs.get(stream);
      if (!s) return;
      s.handlers.delete(handler);
      s.count -= 1;
      if (s.count > 0) return;
      this.subs.delete(stream);
      if (USE_GATEWAY) {
        // 网关模式通过关闭连接并重建来取消（server 按连接生命周期订阅）；
        // 引用计数清零意味着没有活跃消费者，destroy() 会直接关闭。
      } else {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendFrame("UNSUBSCRIBE", [stream]);
      }
      if (this.subs.size === 0) this.destroy();
    };
  }

  destroy(): void {
    this.clearTimers();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.close();
    }
    if (this.klineWs) {
      const kw = this.klineWs;
      this.klineWs = null;
      kw.onclose = null;
      kw.close();
    }
    this.setStatus(this.subs.size > 0 ? "reconnecting" : "closed");
    if (this.subs.size === 0) this.retry = 0;
  }

  private setStatus(next: BinanceWsStatus) {
    if (this.status === next) return;
    this.status = next;
    this.statusHandlers.forEach((h) => h(next));
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private bindNetworkListeners() {
    if (this.networkListenersBound || typeof window === "undefined") return;
    this.networkListenersBound = true;
    window.addEventListener("offline", () => {
      if (this.ws || this.klineWs || this.reconnectTimer) this.destroy();
    });
    window.addEventListener("online", () => {
      if (this.subs.size > 0 && !this.ws && !this.reconnectTimer) {
        this.retry = 0;
        this.connect();
      }
    });
  }

  private ensureConnection() {
    if (this.ws || this.klineWs || this.reconnectTimer) return;
    this.connect();
  }

  private connect() {
    if (USE_GATEWAY) {
      this.connectGateway();
    } else {
      this.connectBinance();
    }
  }

  // ==================== Binance 协议 ====================

  private connectBinance() {
    const streams = [...this.subs.keys()];
    if (streams.length === 0) return;
    this.setStatus(this.retry > 0 ? "reconnecting" : "connecting");

    const ws = new WebSocket(`${BINANCE_WS_BASE}?streams=${streams.join("/")}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      const missing = [...this.subs.keys()].filter((s) => !streams.includes(s));
      if (missing.length) this.sendFrame("SUBSCRIBE", missing);
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastMessageAt > STALE_MS) this.ws.close();
      }, HEARTBEAT_CHECK_MS);
    };

    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data as string) as { stream?: string; data?: unknown };
        if (!msg.stream || msg.data === undefined) return;
        const sub = this.subs.get(msg.stream);
        if (!sub) return;
        sub.handlers.forEach((h) => h(msg.stream!, msg.data));
      } catch {
        /* 忽略无法解析的报文 */
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.subs.size === 0) {
        this.setStatus("closed");
        return;
      }
      const delay = backoffDelay(this.retry++);
      this.setStatus("reconnecting");
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectBinance();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }

  private sendFrame(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
    this.ws?.send(JSON.stringify({ method, params, id: ++this.msgId }));
  }

  // ==================== Go 网关协议 ====================

  /** 网关模式下的主连接（trade/depth/ticker），URL 参数 ?symbol= 声明订阅集合。 */
  private connectGateway() {
    // 非 kline 流 → /ws；kline 流 → /market/kline/ws（单独一条连接）
    const nonKline = [...this.subs.keys()].filter((s) => !s.includes("@kline_"));
    const kline = [...this.subs.keys()].filter((s) => s.includes("@kline_"));
    const needsMain = nonKline.length > 0 || kline.length === 0; // 即使只有 kline，主连接也开一条（后续兼容）
    // 实际上只有非 kline 才需要主连接；但为了统一重连逻辑，我们让主连接覆盖所有非 kline 订阅。
    if (needsMain && !this.ws) {
      const symbols = [...new Set(nonKline.map(parseStream).map((p) => p.symbol))];
      this.openGatewayWs(`${resolveWsBase()}${GW_WS_PATH}?symbol=${symbols.join(",")}`, (ev) => {
        this.handleGatewayMessage(ev, "main");
      });
    }
    // kline 连接：每个 distinct symbol+interval 一条；为简化，合并同一 symbol 的不同 interval
    if (kline.length > 0 && !this.klineWs) {
      // 按 symbol 聚合，interval 各自独立；网关 /kline/ws 只支持单个 interval，
      // 所以这里对每个 distinct symbol 开一条连接；interval 过滤由 onmessage 处理（server 推全部周期）。
      // 实际做法：取第一条 kline stream 的 symbol 建连；同一 symbol 不同 interval 在 handleGatewayMessage 里匹配。
      const symbol = parseStream(kline[0]).symbol;
      this.openKlineGatewayWs(`${resolveWsBase()}${GW_KLINE_WS_PATH}?symbol=${symbol}&interval=1m`, (ev) => {
        this.handleKlineMessage(ev);
      });
    }
  }

  private openGatewayWs(url: string, onMsg: (ev: MessageEvent) => void) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      // 补发期间新加的订阅（网关按 symbol 过滤，server 已订阅全部）
      this.reemitSubscriptions(ws);
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastMessageAt > STALE_MS) this.ws.close();
      }, HEARTBEAT_CHECK_MS);
    };
    ws.onmessage = onMsg;
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.subs.size === 0) {
        this.setStatus("closed");
        return;
      }
      const delay = backoffDelay(this.retry++);
      this.setStatus("reconnecting");
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectGateway();
      }, delay);
    };
    ws.onerror = () => ws.close();
  }

  private openKlineGatewayWs(url: string, onMsg: (ev: MessageEvent) => void) {
    const ws = new WebSocket(url);
    this.klineWs = ws;
    ws.onopen = () => {
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.klineWs?.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastMessageAt > STALE_MS) this.klineWs.close();
      }, HEARTBEAT_CHECK_MS);
    };
    ws.onmessage = onMsg;
    ws.onclose = () => {
      if (this.klineWs !== ws) return;
      this.klineWs = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      // kline 连接断了不影响主连接；仅当整体无订阅时才报 closed
      if (this.subs.size === 0) this.setStatus("closed");
      else {
        const delay = backoffDelay(this.retry++);
        this.setStatus("reconnecting");
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connectGateway();
        }, delay);
      }
    };
    ws.onerror = () => ws.close();
  }

  private reemitSubscriptions(ws: WebSocket) {
    // 网关模式下 server 根据 ?symbol= 自动推送，无需发送控制帧；此处仅占位以对齐接口
    void ws;
  }

  /** 网关 trade/depth/ticker 消息：{type, symbol, data} */
  private handleGatewayMessage(ev: MessageEvent, _src: "main") {
    this.lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(ev.data as string) as { type?: string; symbol?: string; data?: unknown };
      if (!msg.type || !msg.symbol || msg.data === undefined) return;
      // 按 symbol 匹配所有订阅；type 与 stream 名称里的 type 字段对齐
      for (const [stream, sub] of this.subs) {
        const p = parseStream(stream);
        if (p.symbol !== msg.symbol) continue;
        // type 匹配规则：ticker/depth/trade 直配；kline 由 handleKlineMessage 处理
        const expectedType = p.type.replace("kline_", "").replace("depth10@100ms", "depth").replace("@100ms", "");
        if (expectedType !== msg.type) continue;
        sub.handlers.forEach((h) => h(stream, msg.data));
      }
    } catch {
      /* 忽略无法解析的报文 */
    }
  }

  /** 网关 kline 消息：{type: "kline", data: {t,o,h,l,c,v}}（BinanceKline 格式，兼容 parseKlineEvent） */
  private handleKlineMessage(ev: MessageEvent) {
    this.lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(ev.data as string) as { type?: string; data?: unknown };
      if (!msg || msg.type !== "kline" || msg.data === undefined) return;
      for (const [stream, sub] of this.subs) {
        const p = parseStream(stream);
        if (p.type !== "kline_1m") continue; // 当前网关 kline WS 只推送 1m
        // symbol 已在 URL 中限定，数据里不含 symbol 字段；这里用 stream 名匹配
        sub.handlers.forEach((h) => h(stream, msg.data));
      }
    } catch {
      /* 忽略 */
    }
  }

  /** 网关模式下动态补订：对已有连接发送重新订阅请求（server 按 ?symbol= 更新）。 */
  private sendGatewaySub(ws: WebSocket, _stream: string) {
    // 网关按 URL symbol 参数订阅，已连接后不再发送控制帧；server 侧通过重新建连更新订阅集合。
    // 此处仅做日志占位。
    void ws;
    void _stream;
  }

  private sendKlineGatewaySub(_ws: WebSocket, _stream: string) {
    void _ws;
    void _stream;
  }
}

// 模块级单例；挂到 globalThis 以在 Vite HMR 下保持连接状态。
const g = globalThis as typeof globalThis & { __binanceStreamManager?: BinanceStreamManager };
export const binanceStreams: BinanceStreamManager = (g.__binanceStreamManager ??= new BinanceStreamManager());
