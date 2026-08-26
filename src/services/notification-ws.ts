// 通知实时推送 WebSocket 客户端（替代前端轮询）。
//
// 连接网关 /api/v1/user/notifications/ws?token=...，鉴权后以 user:<id> 通道接收增量通知；
// 后端泵统一推送各业务线（KYC/风控/充值/提现）落库的新通知，前端无需再周期性拉取。
// 断线指数退避重连（复用 binance-ws 的 backoffDelay），并上报连接状态。

import { tokenStore, type UserNotification } from "../api/client";
import { backoffDelay } from "./binance-ws";

export type NotifWsStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";
type NotifHandler = (n: UserNotification) => void;
type StatusHandler = (s: NotifWsStatus) => void;

// 与后端 cmd/notification 的 /api/v1/user/notifications/ws 对应（经网关反代到 notification 服务）。
const PATH = "/api/v1/user/notifications/ws";

function wsURL(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${PATH}?token=${encodeURIComponent(tokenStore.access ?? "")}`;
}

class NotificationSocket {
  private ws: WebSocket | null = null;
  private status: NotifWsStatus = "idle";
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Set<NotifHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private stopped = true;

  getStatus() {
    return this.status;
  }

  onStatus(h: StatusHandler): () => void {
    this.statusHandlers.add(h);
    h(this.status);
    return () => this.statusHandlers.delete(h);
  }

  onNotification(h: NotifHandler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  connect() {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  private setStatus(s: NotifWsStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  private open() {
    if (this.stopped) return;
    if (!tokenStore.access) {
      // 未登录：维持 idle，待登录后由页面再次 connect。
      this.setStatus("idle");
      return;
    }
    this.setStatus(this.retry === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsURL());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("open");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "notification" && msg.data) {
          const n = msg.data as UserNotification;
          this.handlers.forEach((h) => h(n));
        }
      } catch {
        /* 忽略畸形报文 */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = backoffDelay(this.retry++);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.setStatus("closed");
  }
}

export const notificationSocket = new NotificationSocket();
