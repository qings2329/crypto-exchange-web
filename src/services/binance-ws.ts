// Binance 组合行情流多路复用管理器（单连接承载多条 stream）。
//
// 设计要点：
// - 单例 WebSocket（wss://stream.binance.com:9443/stream?streams=...），消息带 stream 名便于路由；
//   运行中新增订阅通过 SUBSCRIBE/UNSUBSCRIBE 帧动态增删，不重连；
// - 引用计数：同一 stream 多个消费者共享一条订阅，计数归零自动 UNSUBSCRIBE，
//   全部订阅为空时销毁连接（组件卸载即清理，杜绝泄漏）；
// - 断线指数退避重连（1s 起、30s 封顶，带随机抖动防雪崩），重连成功后自动补订全部活跃流；
// - 心跳检测：跟踪最近报文时间，连接打开但超过 STALE_MS 无任何消息则强制断开触发重连
//   （协议层 Ping/Pong 由浏览器自动处理，此处兜底"假死连接"）；
// - 断网自动恢复：监听 window online/offline——离线立即挂起，恢复网络即刻重连并重置退避；
// - 状态机通知（connecting/open/reconnecting/closed），供 UI 展示连接健康度。

export type BinanceWsStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

type MessageHandler = (stream: string, data: unknown) => void;
type StatusHandler = (status: BinanceWsStatus) => void;

const WS_BASE = "wss://stream.binance.com:9443/stream";
const BACKOFF_BASE_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
/** 心跳检测间隔与过期阈值：open 状态下超时无报文视为假死 */
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

class BinanceStreamManager {
  private subs = new Map<string, Subscription>();
  private statusHandlers = new Set<StatusHandler>();
  private ws: WebSocket | null = null;
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
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendFrame("SUBSCRIBE", [stream]);
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
      // 最后一个消费者离开：移除订阅
      this.subs.delete(stream);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendFrame("UNSUBSCRIBE", [stream]);
      }
      if (this.subs.size === 0) this.destroy(); // 无订阅则彻底销毁连接
    };
  }

  /** 销毁连接（保留订阅表用于重连场景外的显式复位时清空）。 */
  destroy(): void {
    this.clearTimers();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null; // 防止触发 onClose 的重连逻辑
      ws.close();
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

  /** 浏览器网络事件：离线挂起、联网即恢复（仅绑定一次）。 */
  private bindNetworkListeners() {
    if (this.networkListenersBound || typeof window === "undefined") return;
    this.networkListenersBound = true;
    window.addEventListener("offline", () => {
      // 断网：立即挂起当前连接，进入 reconnecting 等待 online
      if (this.ws || this.reconnectTimer) this.destroy();
    });
    window.addEventListener("online", () => {
      // 恢复联网：重置退避并立刻重连
      if (this.subs.size > 0 && !this.ws && !this.reconnectTimer) {
        this.retry = 0;
        this.connect();
      }
    });
  }

  private ensureConnection() {
    if (this.ws || this.reconnectTimer) return;
    this.connect();
  }

  private connect() {
    const streams = [...this.subs.keys()];
    if (streams.length === 0) return;
    this.setStatus(this.retry > 0 ? "reconnecting" : "connecting");

    const ws = new WebSocket(`${WS_BASE}?streams=${streams.join("/")}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      // URL 只含建连时的流；CONNECTING 期间新增的订阅在此补发
      const missing = [...this.subs.keys()].filter((s) => !streams.includes(s));
      if (missing.length) this.sendFrame("SUBSCRIBE", missing);
      // 启动心跳检测：假死连接兜底
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastMessageAt > STALE_MS) {
          // 强制断开 → 走 onClose 的指数退避重连
          this.ws.close();
        }
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
      if (this.ws !== ws) return; // 已被 destroy() 取代
      this.ws = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.subs.size === 0) {
        this.setStatus("closed");
        return;
      }
      // 指数退避重连（含抖动）
      const delay = backoffDelay(this.retry++);
      this.setStatus("reconnecting");
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }

  private sendFrame(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
    this.ws?.send(JSON.stringify({ method, params, id: ++this.msgId }));
  }
}

// 模块级单例；挂到 globalThis 以在 Vite HMR 下保持连接状态。
const g = globalThis as typeof globalThis & { __binanceStreamManager?: BinanceStreamManager };
export const binanceStreams: BinanceStreamManager = (g.__binanceStreamManager ??= new BinanceStreamManager());
