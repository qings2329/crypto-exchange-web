// 资产总览：总资产折算（USDT/BTC 计价）+ 分布饼图 + 资产列表与快捷操作。
// 敏感数字可通过眼睛图标隐藏（偏好持久化到 LocalStorage）。
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchTickers } from "../../services/binance";
import { api } from "../../api/client";
import { fmtPrice, fmtQty, fmtCompact } from "../../lib/format";
import { useToast } from "../Toast";
import { Modal } from "../Modal";
import { SecureText } from "../security/SecureText";

type WalletRow = { asset: string; available: number; frozen: number };

const HIDE_KEY = "cx_hide_balance";
const PIE_COLORS = ["#FCD535", "#0ECB81", "#4B9EFF"];

function Masked({ value, hidden }: { value: string; hidden: boolean }) {
  if (hidden) return <span className="font-mono tabular-nums">******</span>;
  return <SecureText value={value} />;
}

export function AssetOverview({ onWithdraw }: { onWithdraw?: (asset: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  // 服务端余额（充值/提现/划转的真实账本），操作成功后 invalidate 刷新
  const { data: balances } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => api.futuresWalletBalance() as Promise<WalletRow[]>,
    refetchInterval: 15_000,
  });
  const [depRow, setDepRow] = useState<WalletRow | null>(null);
  const [trRow, setTrRow] = useState<WalletRow | null>(null);
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

      {!balances || balances.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500">Connect wallet to view your assets.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* 左：总资产 + 饼图 */}
          <div className="flex flex-col items-center rounded-lg border border-neutral-800/60 p-4">
            <span className="text-xs text-gray-500">Total Value</span>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100" data-testid="total-usd">
              <Masked value={`$${fmtPrice(totalUsd)}`} hidden={hidden} />
            </div>
            <div className="text-xs text-gray-500">
              ≈ <Masked value={`${totalBtc.toFixed(6)} BTC`} hidden={hidden} />
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
                {rows.map((r) => (
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
                        <button onClick={() => setDepRow(r)} data-testid={`dep-${r.asset}`} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#0ECB81]/70 hover:text-[#0ECB81]">
                          Deposit
                        </button>
                        <button onClick={() => onWithdraw?.(r.asset)} data-testid={`wd-${r.asset}`} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#F6465D]/70 hover:text-[#F6465D]">
                          Withdraw
                        </button>
                        <button onClick={() => setTrRow(r)} data-testid={`tr-${r.asset}`} className="rounded-md border border-neutral-700 px-2 py-1 text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]">
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

      {depRow && (
        <DepositModal
          row={depRow}
          onClose={() => setDepRow(null)}
          onDone={async () => {
            setDepRow(null);
            await qc.invalidateQueries({ queryKey: ["wallet-balance"] });
            toast.success("Deposit credited");
          }}
        />
      )}
      {trRow && (
        <TransferModal
          row={trRow}
          onClose={() => setTrRow(null)}
          onDone={async () => {
            setTrRow(null);
            await qc.invalidateQueries({ queryKey: ["wallet-balance"] });
            toast.success("Transfer completed");
          }}
        />
      )}
    </div>
  );
}

/** 充值弹窗：按资产+网络生成确定性充值地址；"模拟到账"走服务端入账。 */
function DepositModal({ row, onClose, onDone }: { row: WalletRow; onClose: () => void; onDone: () => void | Promise<void> }) {
  const toast = useToast();
  const networks = ["ERC20", "TRC20", "BEP20"];
  const [network, setNetwork] = useState("ERC20");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  // 确定性地址（演示）：uid+asset+network 哈希 → 0x + 40 hex
  const address = useMemo(() => {
    let h = 2166136261;
    const seed = `${row.asset}-${network}`;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let out = "";
    let x = h >>> 0;
    while (out.length < 40) {
      x = (x * 1664525 + 1013904223) >>> 0;
      out += x.toString(16).padStart(8, "0");
    }
    return `0x${out.slice(0, 40)}`;
  }, [row.asset, network]);

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    setBusy(true);
    try {
      await api.futuresDeposit({ asset: row.asset, amount: amt, network });
      await onDone();
    } catch (e) {
      toast.error((e as Error).message || "Deposit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Deposit ${row.asset}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs text-gray-500">Network</div>
          <select value={network} onChange={(e) => setNetwork(e.target.value)} className="h-9 w-full rounded-lg border border-neutral-700 bg-[#181A20] px-2 text-slate-200">
            {networks.map((n) => (
              <option key={n} value={n}>{`${row.asset === "USDT" ? "Tron (TRC20)" : n}`}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">Deposit Address</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-neutral-700 bg-[#181A20] px-3 py-2 font-mono text-xs text-slate-300" data-testid="deposit-address">{address}</code>
            <button onClick={() => void navigator.clipboard?.writeText(address)} className="rounded-lg border border-neutral-700 px-2 py-1.5 text-xs text-slate-300 hover:border-[#FCD535]/60 hover:text-[#FCD535]">Copy</button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
            Send only <b className="text-slate-400">{row.asset}</b> to this address. Min deposit 10 {row.asset}. Credited after 2 network confirmations.
          </p>
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">Simulate arrival amount</div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            data-testid="deposit-amount"
            className="h-9 w-full rounded-lg border border-neutral-700 bg-[#181A20] px-3 font-mono text-sm tabular-nums text-slate-200 outline-none focus:border-[#FCD535]"
          />
        </div>
        <button
          disabled={busy || !(Number(amount) > 0)}
          onClick={() => void submit()}
          data-testid="deposit-submit"
          className="h-9 w-full cursor-pointer rounded-lg bg-[#0ECB81] text-sm font-semibold text-black transition-colors hover:bg-[#0ECB81]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Crediting…" : "Confirm Deposit"}
        </button>
      </div>
    </Modal>
  );
}

/** 划转弹窗：资金账户(可用) ⇄ 合约保证金(冻结)。 */
function TransferModal({ row, onClose, onDone }: { row: WalletRow; onClose: () => void; onDone: () => void | Promise<void> }) {
  const toast = useToast();
  const [direction, setDirection] = useState<"to_futures" | "to_funding">("to_futures");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    if (direction === "to_futures" && amt > row.available) {
      toast.error("Insufficient available balance");
      return;
    }
    if (direction === "to_funding" && amt > row.frozen) {
      toast.error("Insufficient futures margin");
      return;
    }
    setBusy(true);
    try {
      await api.futuresTransfer({ asset: row.asset, amount: amt, direction });
      await onDone();
    } catch (e) {
      toast.error((e as Error).message || "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Transfer ${row.asset}`} onClose={onClose}>
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
