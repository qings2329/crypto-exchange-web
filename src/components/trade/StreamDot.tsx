import type { BinanceWsStatus } from "../../services/binance-ws";

const CONFIG: Record<BinanceWsStatus, { color: string; label: string }> = {
  idle: { color: "bg-muted", label: "IDLE" },
  connecting: { color: "bg-accent animate-pulse", label: "CONNECTING" },
  open: { color: "bg-buy", label: "LIVE" },
  reconnecting: { color: "bg-accent animate-pulse", label: "RECONNECTING" },
  closed: { color: "bg-muted", label: "OFFLINE" },
};

/** 行情流连接健康度指示灯（绿=实时，黄闪=重连中，灰=离线）。 */
export function StreamDot({ status }: { status: BinanceWsStatus }) {
  const cfg = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted" title={cfg.label}>
      <span className={`size-1.5 rounded-full ${cfg.color}`} />
      {cfg.label}
    </span>
  );
}
