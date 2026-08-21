// 全币种行情表格：搜索 / 排序 / 自选星标 / 迷你走势图。
import { useMemo, useState } from "react";
import type { Ticker } from "../../types";
import { fuzzyFilter, sortTickers, coinName, baseAsset, type SortKey } from "../../lib/market-utils";
import { fmtPrice, fmtPercent, fmtCompact } from "../../lib/format";
import { useFavoritesStore } from "../../store/favorites-store";
import { Sparkline } from "./Sparkline";

const PAGE_SIZE = 50;

interface Column {
  key: SortKey;
  label: string;
  align: "left" | "right";
}

const COLUMNS: Column[] = [
  { key: "price", label: "Last Price", align: "right" },
  { key: "change", label: "24h Change", align: "right" },
  { key: "high", label: "24h High", align: "right" },
  { key: "low", label: "24h Low", align: "right" },
  { key: "volume", label: "24h Volume", align: "right" },
];

export function MarketTable({ rows }: { rows: Ticker[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "volume", dir: -1 });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { favorites, toggle } = useFavoritesStore();

  const filtered = useMemo(() => sortTickers(fuzzyFilter(rows, query), sort), [rows, query, sort]);
  const shown = filtered.slice(0, visible);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "price" ? 1 : -1 }));

  return (
    <div className="rounded-xl border border-neutral-800 bg-card" data-testid="market-table">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 p-3">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search BTC, Ethereum..."
            data-testid="market-search"
            className="w-56 rounded-lg border border-neutral-800 bg-[#0B0F19] px-3 py-1.5 text-sm text-slate-200 outline-none placeholder:text-gray-500 focus:border-[#FCD535]/60"
          />
        </div>
        <span className="text-xs text-gray-500">{filtered.length} pairs</span>
      </div>

      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-xs text-gray-500">
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-normal">Pair</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-normal hover:text-slate-300 ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.label}
                  <span className="ml-0.5 text-[10px] text-[#FCD535]">
                    {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : ""}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-normal">24h Trend</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const up = t.priceChangePercent >= 0;
              const fav = favSet.has(t.symbol);
              return (
                <tr key={t.symbol} className="border-t border-neutral-800/60 hover:bg-[#2B3139]/30">
                  <td className="px-3 py-2">
                    <button
                      aria-label={fav ? `Remove ${t.symbol} from favorites` : `Add ${t.symbol} to favorites`}
                      data-testid={`fav-${t.symbol}`}
                      onClick={() => toggle(t.symbol)}
                      className={`text-base leading-none transition-colors ${fav ? "text-[#FCD535]" : "text-gray-600 hover:text-gray-400"}`}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <a href={`#/trade/${t.symbol}`} className="group flex items-center gap-2">
                      <span className="font-semibold text-slate-100 group-hover:text-[#FCD535]">{baseAsset(t.symbol)}</span>
                      <span className="text-xs text-gray-500">/{coinName(t.symbol)}</span>
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-100">{fmtPrice(t.lastPrice)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${up ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                    {fmtPercent(t.priceChangePercent)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{fmtPrice(t.highPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{fmtPrice(t.lowPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">${fmtCompact(t.quoteVolume)}</td>
                  <td className="py-2 pl-3 pr-4">
                    <div className="flex justify-end">
                      <Sparkline symbol={t.symbol} up={up} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500" data-testid="market-empty">
            {query ? `No results for "${query}"` : "No favorites yet — click the star to add."}
          </div>
        )}
      </div>

      {visible < filtered.length && (
        <div className="border-t border-neutral-800 p-3 text-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="rounded-lg border border-neutral-700 px-4 py-1.5 text-xs text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]"
          >
            Show more ({filtered.length - visible})
          </button>
        </div>
      )}
    </div>
  );
}
