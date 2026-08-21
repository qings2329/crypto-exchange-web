// Binance 流订阅通用 Hook：
// - 挂载即订阅、卸载即取消（引用计数归零由管理器销毁连接）；
// - latest-callback ref 模式，回调变化不触发重订阅；
// - 返回连接状态供 UI 展示（open / reconnecting / closed ...）。

import { useEffect, useRef, useState } from "react";
import { binanceStreams, type BinanceWsStatus } from "../services/binance-ws";

export function useBinanceStream(
  streamName: string | null,
  onData: (data: unknown) => void
): BinanceWsStatus {
  const [status, setStatus] = useState<BinanceWsStatus>(binanceStreams.getStatus());
  const cbRef = useRef(onData);
  cbRef.current = onData;

  useEffect(() => {
    if (!streamName) return;
    const offStatus = binanceStreams.onStatus(setStatus);
    const off = binanceStreams.subscribe(streamName, (_stream, data) => cbRef.current(data));
    return () => {
      off();
      offStatus();
    };
  }, [streamName]);

  return status;
}
