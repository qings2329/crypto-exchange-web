// 行情大厅 /markets：顶部市场数据卡片 + 全币种行情表格（现货/合约/自选）。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllTickers, fetchAllFuturesTickers, fetchOnboardDates } from "../services/binance";
import type { Ticker } from "../types";
import { MarketStatCards } from "../components/markets/MarketStatCards";
import { MarketTable } from "../components/markets/MarketTable";
import { useFavoritesStore } from "../store/favorites-store";

type Tab = "spot" | "futures" | "favorites";

const TABS: { key: Tab; label: string }[] = [
  { key: "spot", label: "Spot" },
  { key: "futures", label: "Futures" },
  { key: "favorites", label: "Favorites" },
];

const usdtOnly = (rows: Ticker[]) => rows.filter((t) => t.symbol.endsWith("USDT"));

export function Markets() {
  const [tab, setTab] = useState<Tab>("spot");
  const favorites = useFavoritesStore((s) => s.favorites);

  const spot = useQuery({ queryKey: ["markets", "spot"], queryFn: fetchAllTickers, staleTime: 30_000, refetchInterval: 30_000 });
  const futures = useQuery({
    queryKey: ["markets", "futures"],
    queryFn: fetchAllFuturesTickers,
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: tab === "futures",
  });
  const onboard = useQuery({ queryKey: ["markets", "onboard"], queryFn: fetchOnboardDates, staleTime: Infinity });

  const spotRows = useMemo(() => usdtOnly(spot.data ?? []), [spot.data]);
  const futuresRows = useMemo(() => usdtOnly(futures.data ?? []), [futures.data]);
  const favRows = useMemo(() => {
    const set = new Set(favorites);
    return spotRows.filter((t) => set.has(t.symbol));
  }, [spotRows, favorites]);

  const loading = spot.isLoading || onboard.isLoading;
  const error = spot.isError;

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4" data-testid="markets-page">
      <h1 className="text-xl font-bold text-slate-100">Markets</h1>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[160px] animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-neutral-800 bg-card p-10 text-center">
          <p className="mb-3 text-sm text-gray-400">Failed to load market data.</p>
          <button onClick={() => spot.refetch()} className="rounded-lg bg-[#FCD535] px-4 py-1.5 text-sm font-semibold text-black hover:bg-[#FCD535]/90">
            Retry
          </button>
        </div>
      ) : (
        <>
          <MarketStatCards rows={spotRows} onboardDates={onboard.data ?? {}} />

          <div>
            <div className="mb-3 flex gap-6 border-b border-neutral-800" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={`tab-${t.key}`}
                  className={`relative pb-2 text-sm font-medium transition-colors ${
                    tab === t.key ? "font-semibold text-slate-100" : "text-gray-500 hover:text-slate-300"
                  }`}
                >
                  {t.label}
                  {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#FCD535]" />}
                </button>
              ))}
            </div>

            {tab === "spot" && <MarketTable rows={spotRows} />}
            {tab === "futures" &&
              (futures.isLoading ? (
                <div className="h-64 animate-pulse rounded-xl bg-card" />
              ) : futures.isError ? (
                <div className="rounded-xl border border-neutral-800 bg-card p-10 text-center text-sm text-gray-400">
                  Failed to load futures market data.
                </div>
              ) : (
                <MarketTable rows={futuresRows} />
              ))}
            {tab === "favorites" && <MarketTable rows={favRows} />}
          </div>
        </>
      )}
    </div>
  );
}
