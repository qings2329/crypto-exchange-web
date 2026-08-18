import { useEffect, useRef, useState, memo } from "react";
import { api, connectSpotWS, type Depth } from "../api/client";
import { reportWsDrop } from "../lib/monitor";
import { useI18n } from "../i18n";

// 订单簿：WebSocket 实时接收深度推送；首屏与 WS 缺失时回退 REST 拉取。
export function OrderBook({ symbol }: { symbol: string }) {
  const { t } = useI18n();
  const [depth, setDepth] = useState<Depth | null>(null);
  const [live, setLive] = useState(false);
  const pollRef = useRef<number | null>(null);
  const wasLive = useRef(false);
  const liveRef = useRef(false); // 与 live 同步，供轮询回调判断是否需要跳过
  const lastPush = useRef(0); // WS 推送节流：合并 100ms 内的多次推送
  const pending = useRef<Depth | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setDepth(null);
    setLive(false);
    liveRef.current = false;
    wasLive.current = false;

    const loadRest = async () => {
      try {
        const d = await api.getDepth(symbol);
        if (alive && !liveRef.current) setDepth(d);
      } catch {
        /* ignore */
      }
    };
    loadRest();

    // 节流应用：WS 高频推送时，每 ≥100ms 最多 setState 一次。
    const apply = (d: Depth) => {
      if (!alive) return;
      setDepth(d);
      setLive(true);
      liveRef.current = true;
      wasLive.current = true;
    };
    const onPush = (d: Depth) => {
      pending.current = d;
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

    const stopWs = connectSpotWS(
      symbol,
      onPush,
      undefined,
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
    pollRef.current = window.setInterval(loadRest, 2000);

    return () => {
      alive = false;
      stopWs();
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [symbol]);

  const asks = (depth?.asks ?? []).slice(0, 10).reverse();
  const bids = (depth?.bids ?? []).slice(0, 10);

  return (
    <div className="orderbook">
      <div className="ob-head">
        <span>{t("trade.obPrice")}</span>
        <span>{t("trade.obQty")}</span>
      </div>
      {asks.map((r, i) => (
        <ObRow key={`a${i}`} cls="ask" price={r.price} volume={r.volume} />
      ))}
      <div className="ob-spread" />
      {bids.map((r, i) => (
        <ObRow key={`b${i}`} cls="bid" price={r.price} volume={r.volume} />
      ))}
      <div className="ob-foot">{live ? t("trade.live") : t("trade.polling")}</div>
    </div>
  );
}

// 行情行：React.memo 避免父组件（depth 节流更新）无关重渲染。
const ObRow = memo(function ObRow({ cls, price, volume }: { cls: string; price: number; volume: number }) {
  return (
    <div className={`ob-row ${cls}`}>
      <span>{price.toFixed(2)}</span>
      <span>{volume.toFixed(4)}</span>
    </div>
  );
});
