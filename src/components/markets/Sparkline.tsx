// 24h 价格微型走势图（SVG 手绘，无第三方依赖）。
// 每行独立拉取 1h K 线 ×24，react-query 长缓存去重；失败时渲染灰色占位。
import { useQuery } from "@tanstack/react-query";
import { fetchKlines } from "../../services/binance";

const W = 100;
const H = 28;
const PAD = 2;

export function Sparkline({ symbol, up }: { symbol: string; up: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sparkline", symbol],
    queryFn: () => fetchKlines(symbol, "1h", 24),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="h-7 w-[100px] animate-pulse rounded bg-neutral-800/60" />;
  if (!data || data.length < 2 || isError) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="opacity-40">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3" />
      </svg>
    );
  }

  const closes = data.map((k) => k.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (closes.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const points = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = up ? "#0ECB81" : "#F6465D";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polygon points={`${PAD},${H - PAD} ${points} ${W - PAD},${H - PAD}`} fill={color} opacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
