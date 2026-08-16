import { useEffect, useRef, useState } from "react";
import { api, connectMarketWS, type Ticker as TickerT } from "../api/client";
import { reportWsDrop } from "../lib/monitor";

// 行情条：优先用 WebSocket 实时推送，断线/未连接时回退 REST 轮询。
export function TickerBar({ symbol }: { symbol: string }) {
  const [ticker, setTicker] = useState<TickerT | null>(null);
  const [live, setLive] = useState(false);
  const pollRef = useRef<number | null>(null);
  const wasLive = useRef(false);

  useEffect(() => {
    let alive = true;
    setTicker(null);
    setLive(false);
    wasLive.current = false;

    const stopWs = connectMarketWS(
      symbol,
      (t) => {
        if (alive) {
          setTicker(t);
          setLive(true);
          wasLive.current = true;
        }
      },
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

    // REST 兜底：每 2s 拉一次，WS 在线时仍保留以防 WS 静默。
    const startPoll = () => {
      pollRef.current = window.setInterval(async () => {
        if (!alive) return;
        try {
          const t = await api.getTicker(symbol);
          if (alive) setTicker(t);
        } catch {
          /* ignore */
        }
      }, 2000);
    };
    startPoll();

    return () => {
      alive = false;
      stopWs();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [symbol]);

  return (
    <div className="ticker">
      <span className="last">{ticker ? ticker.last.toFixed(2) : "--"}</span>
      <span className="muted">最新价</span>
      <span className={live ? "dot live" : "dot"} title={live ? "实时推送" : "轮询"} />
    </div>
  );
}
