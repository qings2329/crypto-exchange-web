// 顶部市场数据卡片：全网 24h 成交额 / 热门 / 涨幅榜 / 新币上线。
import { useMemo } from "react";
import type { Ticker } from "../../types";
import { fmtCompact, fmtPercent, fmtPrice } from "../../lib/format";
import { baseAsset } from "../../lib/market-utils";

function MiniList({ rows, testid }: { rows: Ticker[]; testid: string }) {
  return (
    <ul className="space-y-1.5" data-testid={testid}>
      {rows.map((t) => {
        const up = t.priceChangePercent >= 0;
        return (
          <li key={t.symbol}>
            <a href={`#/trade/${t.symbol}`} className="flex items-center justify-between text-xs hover:bg-[#2B3139]/30">
              <span className="font-medium text-slate-200">{baseAsset(t.symbol)}</span>
              <span className="flex items-center gap-2 font-mono tabular-nums">
                <span className="text-slate-300">{fmtPrice(t.lastPrice)}</span>
                <span className={up ? "text-[#0ECB81]" : "text-[#F6465D]"}>{fmtPercent(t.priceChangePercent)}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

export function MarketStatCards({ rows, onboardDates }: { rows: Ticker[]; onboardDates: Record<string, number> }) {
  const totalVolume = useMemo(() => rows.reduce((s, t) => s + t.quoteVolume, 0), [rows]);
  const hot = useMemo(() => [...rows].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 5), [rows]);
  const gainers = useMemo(() => [...rows].sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 5), [rows]);
  const newListings = useMemo(
    () =>
      [...rows]
        .filter((t) => onboardDates[t.symbol])
        .sort((a, b) => (onboardDates[b.symbol] ?? 0) - (onboardDates[a.symbol] ?? 0))
        .slice(0, 5),
    [rows, onboardDates]
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="market-stat-cards">
      <Card title="Total 24h Volume">
        <div className="flex h-[120px] flex-col justify-center">
          <div className="font-mono text-2xl font-semibold tabular-nums text-[#FCD535]" data-testid="total-volume">
            ${fmtCompact(totalVolume)}
          </div>
          <p className="mt-1 text-xs text-gray-500">Across {rows.length} USDT pairs</p>
        </div>
      </Card>
      <Card title="Hot">
        <MiniList rows={hot} testid="hot-list" />
      </Card>
      <Card title="Top Gainers">
        <MiniList rows={gainers} testid="gainers-list" />
      </Card>
      <Card title="New Listing">
        {newListings.length > 0 ? (
          <MiniList rows={newListings} testid="new-listing-list" />
        ) : (
          <div className="flex h-[120px] items-center justify-center text-xs text-gray-500">Loading listings…</div>
        )}
      </Card>
    </div>
  );
}
