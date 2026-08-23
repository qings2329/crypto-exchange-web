// 资产总览：总资产折算（USDT/BTC 计价）+ 分布饼图 + 资产列表与快捷操作。
// 敏感数字可通过眼睛图标隐藏（偏好持久化到 LocalStorage）。
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchTickers } from "../../services/binance";
import { api, ApiError } from "../../api/client";
import { fmtPrice, fmtQty, fmtCompact } from "../../lib/format";
import { useToast } from "../Toast";
import { Modal } from "../Modal";
import { SecureText } from "../security/SecureText";
import { CoinBadge } from "./CoinBadge";

export type WalletRow = { asset: string; available: number; frozen: number };

const HIDE_KEY = "cx_hide_balance";
const PIE_COLORS = ["#FCD535", "#0ECB81", "#4B9EFF"];

function Masked({ value, hidden }: { value: string; hidden: boolean }) {
  if (hidden) return <span className="font-mono tabular-nums">******</span>;
  return <SecureText value={value} />;
}

export function AssetOverview() {
  // 服务端余额（充值/提现/划转的真实账本），操作成功后 invalidate 刷新
  const { data: balances, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => api.futuresWalletBalance() as Promise<WalletRow[]>,
    refetchInterval: 15_000,
  });
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

  const rows = useMemo<Array<WalletRow & { usdValue: number }>>(
    () =>
      (balances ?? []).map((b) => {
        const px = b.asset === "BTC" ? btcUsdt : b.asset === "ETH" ? ethUsdt : b.asset === "USDT" ? 1 : 0;
        return { ...b, usdValue: (b.available + b.frozen) * px };
      }),
    [balances, btcUsdt, ethUsdt]
  );
  const totalUsd = useMemo(() => rows.reduce((acc, r) => acc + r.usdValue, 0), [rows]);
  const totalBtc = btcUsdt > 0 ? totalUsd / btcUsdt : 0;

  const pieData = useMemo(
    () => rows.filter((r) => r.usdValue > 0).map((r) => ({ name: r.asset, value: r.usdValue })),
    [rows]
  );

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

      {isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-xs text-gray-500">Assets failed to load. Please try again.</p>
          <button
            onClick={() => void refetch()}
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <p className="py-6 text-center text-xs text-gray-500">Loading your assets…</p>
      ) : !balances || balances.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500">No assets yet. Deposit to start trading.</p>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-4 rounded-lg border border-neutral-800/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* 左：总资产 */}
          <div className="flex flex-col items-center sm:items-start">
            <span className="text-xs text-gray-500">Total Value</span>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100" data-testid="total-usd">
              <Masked value={`$${fmtPrice(totalUsd)}`} hidden={hidden} />
            </div>
            <div className="text-xs text-gray-500">
              ≈ <Masked value={`${totalBtc.toFixed(6)} BTC`} hidden={hidden} />
            </div>
          </div>

          {/* 中：饼图 */}
          <div className="h-[150px] w-full max-w-[220px]" data-testid="asset-pie">
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

          {/* 右：图例 */}
          <div className="flex flex-col gap-1.5 text-xs text-gray-400">
            {pieData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-slate-300">{d.name}</span>
                <span className="font-mono tabular-nums">${fmtCompact(d.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 划转弹窗：资金账户(可用) ⇄ 合约保证金(冻结)。 */
export function TransferModal({ row, onClose, onDone, t }: { row: WalletRow; onClose: () => void; onDone: () => void | Promise<void>; t: (k: string) => string }) {
  const toast = useToast();
  const [direction, setDirection] = useState<"to_futures" | "to_funding">("to_futures");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    if (direction === "to_futures" && amt > row.available) {
      toast.error(t("wallet.insufficientBalance"));
      return;
    }
    if (direction === "to_funding" && amt > row.frozen) {
      toast.error(t("wallet.insufficientMargin"));
      return;
    }
    setBusy(true);
    try {
      await api.futuresTransfer({ asset: row.asset, amount: amt, direction });
      await onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e : (e as Error).message || t("wallet.transferFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <CoinBadge asset={row.asset} size={20} />
          Transfer {row.asset}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2" data-testid="transfer-directions">
          <button
            onClick={() => setDirection("to_futures")}
            className={direction === "to_futures" ? "rounded-lg border border-[#FCD535] px-3 py-2 font-semibold text-[#FCD535]" : "rounded-lg border border-neutral-700 px-3 py-2 text-slate-300 hover:border-neutral-500"}
          >
            Funding → Futures
          </button>
          <button
            onClick={() => setDirection("to_funding")}
            className={direction === "to_funding" ? "rounded-lg border border-[#FCD535] px-3 py-2 font-semibold text-[#FCD535]" : "rounded-lg border border-neutral-700 px-3 py-2 text-slate-300 hover:border-neutral-500"}
          >
            Futures → Funding
          </button>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>Amount</span>
            <span className="font-mono tabular-nums">
              {direction === "to_futures" ? `Available ${fmtQty(row.available)}` : `Margin ${fmtQty(row.frozen)}`}
            </span>
          </div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            data-testid="transfer-amount"
            className="h-9 w-full rounded-lg border border-neutral-700 bg-[#181A20] px-3 font-mono text-sm tabular-nums text-slate-200 outline-none focus:border-[#FCD535]"
          />
        </div>
        <button
          disabled={busy || !(Number(amount) > 0)}
          onClick={() => void submit()}
          data-testid="transfer-submit"
          className="h-9 w-full cursor-pointer rounded-lg bg-[#FCD535] text-sm font-semibold text-black transition-colors hover:bg-[#FCD535]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Transferring…" : "Confirm Transfer"}
        </button>
      </div>
    </Modal>
  );
}
