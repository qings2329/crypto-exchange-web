import { useEffect, useRef, useState } from "react";
import { api, connectMarketWS, type Ticker as TickerT } from "../api/client";
import { reportWsDrop } from "../lib/monitor";
import { useI18n } from "../i18n";

// 行情条：优先用 WebSocket 实时推送，断线/未连接时回退 REST 轮询。
export function TickerBar({ symbol }: { symbol: string }) {
  const { t } = useI18n();
  const [ticker, setTicker] = useState<TickerT | null>(null);
  const [live, setLive] = useState(false);
  const pollRef = useRef<number | null>(null);
  const wasLive = useRef(false);
  const liveRef = useRef(false); // 与 live 同步，供轮询回调判断是否需要跳过
  const lastPush = useRef(0); // WS 推送节流：合并 100ms 内的多次推送
  const pending = useRef<TickerT | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setTicker(null);
    setLive(false);
    liveRef.current = false;
    wasLive.current = false;

    // 节流应用：WS 高频推送时，每 ≥100ms 最多 setState 一次。
    const apply = (tk: TickerT) => {
      if (!alive) return;
      setTicker(tk);
      setLive(true);
      liveRef.current = true;
      wasLive.current = true;
    };
    const onPush = (tk: TickerT) => {
      pending.current = tk;
      const now = Date.now();
      const elapsed = now - lastPush.current;
      if (elapsed >= 100) {
        lastPush.current = now;
        apply(pending.current);
        pending.current = null;
      } else if (timer.current == null) {
        timer.current = window.setTimeout(() => {
          lastPush.current = Date.now();
          timer.current = null;
          if (pending.current) apply(pending.current);
          pending.current = null;
        }, 100 - elapsed);
      }
    };

    const stopWs = connectMarketWS(
      symbol,
      onPush,
      () => {
        // WS 断线：仅在曾推送过（live true→false）时上报，卸载不报
        if (!alive) return;
        setLive(false);
        liveRef.current = false;
        if (wasLive.current) {
          wasLive.current = false;
          reportWsDrop(symbol);
        }
      }
    );

    // REST 兜底：每 2s 拉一次；WS 在线时跳过以省流量（见 README 性能优化）。
    pollRef.current = window.setInterval(async () => {
      if (!alive || liveRef.current) return;
      try {
        const tk = await api.getTicker(symbol);
        if (alive) setTicker(tk);
      } catch {
        /* ignore */
      }
    }, 2000);

    return () => {
      alive = false;
      stopWs();
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [symbol]);

  return (
    <div className="ticker">
      <span className="last">{ticker ? ticker.last.toFixed(2) : "--"}</span>
      <span className="muted">{t("trade.lastPrice")}</span>
      <span className={live ? "dot live" : "dot"} title={live ? t("trade.livePush") : t("trade.polling")} />
    </div>
  );
}
