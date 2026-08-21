// Binance 流订阅通用 Hook（兼容层）：委托 useBinanceWS 实现。
// - 挂载即订阅、卸载即取消（引用计数归零由管理器销毁连接）；
// - latest-callback ref 模式，回调变化不触发重订阅；
// - 返回连接状态供 UI 展示（open / reconnecting / closed ...）。

import { useRef } from "react";
import { useBinanceWS } from "./useBinanceWS";
import type { BinanceWsStatus } from "../services/binance-ws";

export function useBinanceStream(
  streamName: string | null,
  onData: (data: unknown) => void
): BinanceWsStatus {
  const cbRef = useRef(onData);
  cbRef.current = onData;

  const { status } = useBinanceWS({
    streams: streamName ? [streamName] : undefined,
    onMessage: (_stream, data) => cbRef.current(data),
  });

  return status;
}
