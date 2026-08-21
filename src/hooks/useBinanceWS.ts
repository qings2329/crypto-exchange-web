// useBinanceWS —— Binance 组合流通用 Hook。
// - 声明式订阅：streams 数组变化自动增删（动态订阅/取消订阅）；
// - 命令式 API：返回稳定的 subscribe/unsubscribe，供运行时按需增删频道；
// - latest-callback ref 模式：onMessage 变化不触发重订阅；
// - 状态透出：connecting/open/reconnecting/closed + 最近报文时间（心跳健康度）。
//
// 底层复用模块级多路复用管理器 binanceStreams（单连接、引用计数、指数退避重连、
// 心跳假死检测、断网自动恢复），详见 services/binance-ws.ts。

import { useCallback, useEffect, useRef, useState } from "react";
import { binanceStreams, type BinanceWsStatus } from "../services/binance-ws";

export interface UseBinanceWSOptions {
  /** 声明式订阅的 stream 列表（如 ["btcusdt@ticker"]）；变化时自动 SUBSCRIBE/UNSUBSCRIBE */
  streams?: string[];
  /** false 时完全断开并清理订阅 */
  enabled?: boolean;
  /** 报文回调（stream 名 + 已解析的 data） */
  onMessage?: (stream: string, data: unknown) => void;
}

export interface UseBinanceWSResult {
  status: BinanceWsStatus;
  lastMessageAt: number;
  /** 运行时动态订阅；返回取消函数 */
  subscribe: (stream: string, handler?: (data: unknown) => void) => () => void;
  /** 运行时取消订阅：移除本 Hook 在该流上注册的全部处理器 */
  unsubscribe: (stream: string) => void;
}

export function useBinanceWS({ streams, enabled = true, onMessage }: UseBinanceWSOptions = {}): UseBinanceWSResult {
  const [status, setStatus] = useState<BinanceWsStatus>(binanceStreams.getStatus());
  const [lastMessageAt, setLastMessageAt] = useState(0);

  // latest-callback ref：回调身份变化不引起重订阅
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // 本 Hook 注册的取消函数登记表（供 unsubscribe 整流移除）
  const offsRef = useRef(new Map<string, Set<() => void>>());

  const register = useCallback((stream: string, handler?: (data: unknown) => void) => {
    const off = binanceStreams.subscribe(stream, (_s, data) =>
      handler ? handler(data) : onMessageRef.current?.(_s, data)
    );
    const set = offsRef.current.get(stream) ?? new Set();
    set.add(off);
    offsRef.current.set(stream, set);
    return () => {
      off();
      set.delete(off);
    };
  }, []);

  /** 运行时动态订阅；返回取消函数 */
  const subscribe = useCallback(
    (stream: string, handler?: (data: unknown) => void) => register(stream, handler),
    [register]
  );

  /** 运行时取消订阅：移除该流上本 Hook 注册的全部处理器 */
  const unsubscribe = useCallback((stream: string) => {
    const set = offsRef.current.get(stream);
    if (!set) return;
    set.forEach((off) => off());
    offsRef.current.delete(stream);
  }, []);

  // 连接状态同步（管理器为单例广播，这里做轻量镜像 + 心跳时间轮询）
  useEffect(() => {
    if (!enabled) return;
    const off = binanceStreams.onStatus(setStatus);
    const t = setInterval(() => setLastMessageAt(binanceStreams.getLastMessageAt()), 1_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [enabled]);

  // 声明式 streams 订阅（数组内容变化 → 自动增删）
  const streamsKey = streams?.join("\n") ?? "";
  useEffect(() => {
    if (!enabled || !streamsKey) return;
    const list = streamsKey.split("\n");
    const offs = list.map((s) => register(s));
    return () => offs.forEach((off) => off());
  }, [streamsKey, enabled, register]);

  return { status, lastMessageAt, subscribe, unsubscribe };
}
