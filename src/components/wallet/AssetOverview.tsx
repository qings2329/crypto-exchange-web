// 资产总览：总资产折算（USDT/BTC 计价）+ 分布饼图 + 资产列表与快捷操作。
// 敏感数字可通过眼睛图标隐藏（偏好持久化到 LocalStorage）。
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchTickers } from "../../services/binance";
import { useMockBalances } from "../../hooks/use-mock-balances";
import { valueAssets } from "../../lib/wallet-utils";
import { fmtPrice, fmtQty, fmtCompact } from "../../lib/format";
import { useToast } from "../Toast";
import { SecureText } from "../security/SecureText";

const HIDE_KEY = "cx_hide_balance";
const PIE_COLORS = ["#FCD535", "#0ECB81", "#4B9EFF"];

function Masked({ value, hidden }: { value: string; hidden: boolean }) {
  if (hidden) return <span className="font-mono tabular-nums">******</span>;
  return <SecureText value={value} />;
}

export function AssetOverview() {
  const toast = useToast();
  const balances = useMockBalances();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_KEY, hidden ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [hidden]);

  const { data: tickers } = useQuery({
    queryKey: ["wallet-prices"],
    queryFn: () => fetchTickers(["BTCUSDT", "ETHUSDT"]),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const btcUsdt = tickers?.find((t) => t.symbol === "BTCUSDT")?.lastPrice ?? 0;
  const ethUsdt = tickers?.find((t) => t.symbol === "ETHUSDT")?.lastPrice ?? 0;

  const portfolio = useMemo(
    () => (balances && btcUsdt > 0 ? valueAssets(balances, { btcUsdt, ethUsdt }) : null),
    [balances, btcUsdt, ethUsdt]
  );

  const pieData = useMemo(
    () => (portfolio ? portfolio.rows.filter((r) => r.usdValue > 0).map((r) => ({ name: r.asset, value: r.usdValue })) : []),
    [portfolio]
  );

  const demoAction = (label: string) => toast.info(`${label}: demo only — connect a funded account.`);

  return (
    <div className="rounded-xl border border-neutral-800 bg-card p-4" data-testid="asset-overview">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Overview</h3>
        <button
          aria-label={hidden ? "Show balances" : "Hide balances"}
          data-testid="toggle-hide-balance"
          onClick={() => setHidden((v) => !v)}
          className="text-lg leading-none text-gray-500 hover:text-slate-300"
        >
          {hidden ? "🙈" : "👁"}
        </button>
      </div>

      {!balances ? (
        <p className="py-6 text-center text-xs text-gray-500">Connect wallet to view your assets.</p>
      ) : !portfolio ? (
        <div className="mt-4 h-[180px] animate-pulse rounded-lg bg-neutral-800/60" />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* 左：总资产 + 饼图 */}
          <div className="flex flex-col items-center rounded-lg border border-neutral-800/60 p-4">
            <span className="text-xs text-gray-500">Total Value</span>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100" data-testid="total-usd">
              <Masked value={`$${fmtPrice(portfolio.totalUsd)}`} hidden={hidden} />
            </div>
            <div className="text-xs text-gray-500">
              ≈ <Masked value={`${portfolio.totalBtc.toFixed(6)} BTC`} hidden={hidden} />
            </div>
            <div className="h-[150px] w-full" data-testid="asset-pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2} strokeWidth={0}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1E2329", border: "1px solid #2B3139", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => `$${fmtCompact(Number(v))}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 text-xs text-gray-400">
              {pieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          {/* 右：资产列表 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="px-3 py-2 text-left font-normal">Asset</th>
                  <th className="px-3 py-2 text-right font-normal">Available</th>
                  <th className="px-3 py-2 text-right font-normal">Frozen</th>
                  <th className="px-3 py-2 text-right font-normal">Value (USD)</th>
                  <th className="px-3 py-2 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.rows.map((r) => (
                  <tr key={r.asset} className="border-t border-neutral-800/60 hover:bg-[#2B3139]/30">
                    <td className="px-3 py-2.5 font-semibold text-slate-100">{r.asset}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                      <Masked value={fmtQty(r.available)} hidden={hidden} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-400">
                      <Masked value={fmtQty(r.frozen)} hidden={hidden} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                      <Masked value={`$${fmtPrice(r.usdValue)}`} hidden={hidden} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5 text-xs">
                        <button onClick={() => demoAction("Deposit")} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]">
                          Deposit
                        </button>
                        <button onClick={() => demoAction("Withdraw")} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]">
                          Withdraw
                        </button>
                        <button onClick={() => demoAction("Transfer")} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]">
                          Transfer
                        </button>
                        <a href={`#/trade/${r.asset === "USDT" ? "BTC" : r.asset}USDT`} className="rounded-md bg-[#FCD535] px-2 py-1 font-semibold text-black hover:bg-[#FCD535]/90">
                          Trade
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
