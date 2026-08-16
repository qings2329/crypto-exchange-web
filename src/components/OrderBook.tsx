import { useEffect, useRef, useState } from "react";
import { api, connectSpotWS, type Depth } from "../api/client";
import { reportWsDrop } from "../lib/monitor";

// 订单簿：WebSocket 实时接收深度推送；首屏与 WS 缺失时回退 REST 拉取。
export function OrderBook({ symbol }: { symbol: string }) {
  const [depth, setDepth] = useState<Depth | null>(null);
  const [live, setLive] = useState(false);
  const pollRef = useRef<number | null>(null);
  const wasLive = useRef(false);

  useEffect(() => {
    let alive = true;
    setDepth(null);
    setLive(false);
    wasLive.current = false;

    const loadRest = async () => {
      try {
        const d = await api.getDepth(symbol);
        if (alive) setDepth(d);
      } catch {
        /* ignore */
      }
    };
    loadRest();

    const stopWs = connectSpotWS(
      symbol,
      (d) => {
        if (alive) {
          setDepth(d);
          setLive(true);
          wasLive.current = true;
        }
      },
      undefined,
      () => {
        // WS 断线：仅在曾推送过（live true→false）时上报，卸载不报
        if (!alive) return;
        setLive(false);
        if (wasLive.current) {
          wasLive.current = false;
          reportWsDrop(symbol);
        }
      }
    );

    pollRef.current = window.setInterval(loadRest, 2000);

    return () => {
      alive = false;
      stopWs();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [symbol]);

  const asks = (depth?.asks ?? []).slice(0, 10).reverse();
  const bids = (depth?.bids ?? []).slice(0, 10);

  return (
    <div className="orderbook">
      <div className="ob-head">
        <span>价格</span>
        <span>数量</span>
      </div>
      {asks.map((r, i) => (
        <div className="ob-row ask" key={`a${i}`}>
          <span>{r.price.toFixed(2)}</span>
          <span>{r.volume.toFixed(4)}</span>
        </div>
      ))}
      <div className="ob-spread" />
      {bids.map((r, i) => (
        <div className="ob-row bid" key={`b${i}`}>
          <span>{r.price.toFixed(2)}</span>
          <span>{r.volume.toFixed(4)}</span>
        </div>
      ))}
      <div className="ob-foot">{live ? "实时" : "轮询"}</div>
    </div>
  );
}
