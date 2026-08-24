// 历史订单：当前委托 / 历史委托 / 成交明细 三 Tab，带时间筛选与撤单确认。
// 数据源为本地模拟订单 store（与交易页下单面板共享）。
import { useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useOrdersStore, type TradeOrder } from "../../store/orders-store";
import { withinRange, type TimeRange } from "../../lib/order-filters";
import { fmtPrice, fmtQty } from "../../lib/format";
import { useConfirm } from "../Confirm";
import { useToast } from "../Toast";

type Tab = "open" | "history" | "trades";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open Orders" },
  { key: "history", label: "Order History" },
  { key: "trades", label: "Trade History" },
];

const RANGE_LABELS: { key: TimeRange["kind"]; label: string }[] = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "all", label: "All" },
];

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function SideTag({ side }: { side: TradeOrder["side"] }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${side === "buy" ? "bg-[#0ECB81]/15 text-[#0ECB81]" : "bg-[#F6465D]/15 text-[#F6465D]"}`}>
      {side === "buy" ? "Buy" : "Sell"}
    </span>
  );
}

function StatusTag({ o }: { o: TradeOrder }) {
  const map = {
    open: "text-[#FCD535]",
    filled: "text-[#0ECB81]",
    canceled: "text-gray-500",
  } as const;
  return <span className={`text-xs font-medium capitalize ${map[o.status]}`}>{o.status}</span>;
}

export function OrderHistory() {
  const [tab, setTab] = useState<Tab>("open");
  const [rangeKind, setRangeKind] = useState<TimeRange["kind"]>("all");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const orders = useOrdersStore((s) => s.orders);
  const cancel = useOrdersStore((s) => s.cancel);
  const toast = useToast();
  const confirm = useConfirm();

  // 自定义区间：日期字符串 -> 时间戳闭区间
  const range: TimeRange = useMemo(() => {
    if (rangeKind !== "custom") return { kind: rangeKind };
    const from = fromDay ? new Date(`${fromDay}T00:00:00`).getTime() : 0;
    const to = toDay ? new Date(`${toDay}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    return { kind: "custom", from, to };
  }, [rangeKind, fromDay, toDay]);

  const rows = useMemo(() => {
    if (tab === "open") return orders.filter((o) => o.status === "open");
    if (tab === "history") return orders.filter((o) => o.status !== "open" && withinRange(o.settledTs ?? o.ts, range));
    // 成交明细：由已成交订单推导（成交时间 = settledTs）
    return orders.filter((o) => o.status === "filled" && withinRange(o.settledTs ?? o.ts, range));
  }, [orders, tab, range]);

  const onCancel = async (o: TradeOrder) => {
    const ok = await confirm({
      title: "Cancel Order",
      message: (
        <span>
          Cancel <b>{o.side.toUpperCase()}</b> {fmtQty(o.qty)} {o.symbol} @ {fmtPrice(o.price)}?
        </span>
      ),
      danger: true,
      confirmText: "Confirm Cancel",
    });
    if (!ok) return;
    cancel(o.id); // 本地乐观撤销 + 记入已撤集合
    // 同步服务端：按订单归属市场路由（本地单均带 market；无标注的旧数据仅本地撤销）
    const srvId = Number(o.id.startsWith("SRV-") ? o.id.slice(4) : o.id);
    try {
      if (Number.isFinite(srvId) && srvId > 0) {
        if (o.market === "perp") await api.futuresCancelOrder({ symbol: o.symbol, orderId: srvId });
        else await api.spotCancelOrder({ symbol: o.symbol, orderId: srvId });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    }
  };

  const isTrades = tab === "trades";

  return (
    <div className="rounded-xl border border-neutral-800 bg-card" data-testid="order-history">
      {/* Tabs */}
      <div className="flex gap-6 border-b border-neutral-800 px-4 pt-3" role="tablist">
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

      {/* 时间筛选 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <span className="text-xs text-gray-500">Time:</span>
        {RANGE_LABELS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKind(r.key)}
            data-testid={`range-${r.key}`}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              rangeKind === r.key ? "bg-[#FCD535] font-semibold text-black" : "border border-neutral-700 text-slate-300 hover:border-[#FCD535]/60"
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setRangeKind("custom")}
          data-testid="range-custom"
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            rangeKind === "custom" ? "bg-[#FCD535] font-semibold text-black" : "border border-neutral-700 text-slate-300 hover:border-[#FCD535]/60"
          }`}
        >
          Custom
        </button>
        {rangeKind === "custom" && (
          <span className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="date"
              value={fromDay}
              onChange={(e) => setFromDay(e.target.value)}
              data-testid="date-from"
              className="rounded-md border border-neutral-700 bg-[#0B0F19] px-2 py-1 text-xs text-slate-200 outline-none [color-scheme:dark]"
            />
            <span>→</span>
            <input
              type="date"
              value={toDay}
              onChange={(e) => setToDay(e.target.value)}
              data-testid="date-to"
              className="rounded-md border border-neutral-700 bg-[#0B0F19] px-2 py-1 text-xs text-slate-200 outline-none [color-scheme:dark]"
            />
          </span>
        )}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-normal">Time</th>
              <th className="px-3 py-2 text-left font-normal">Pair</th>
              <th className="px-3 py-2 text-left font-normal">Side</th>
              {!isTrades && <th className="px-3 py-2 text-left font-normal">Type</th>}
              <th className="px-3 py-2 text-right font-normal">Price</th>
              <th className="px-3 py-2 text-right font-normal">Qty</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              {!isTrades && <th className="px-3 py-2 text-left font-normal">Status</th>}
              {!isTrades && tab === "open" && <th className="px-4 py-2 text-right font-normal">Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-neutral-800/60 hover:bg-[#2B3139]/30">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs tabular-nums text-gray-400">{fmtTs(o.settledTs ?? o.ts)}</td>
                <td className="px-3 py-2.5">
                  <a href={`#/trade/${o.symbol}`} className="font-medium text-slate-100 hover:text-[#FCD535]">
                    {o.symbol}
                  </a>
                </td>
                <td className="px-3 py-2.5">
                  <SideTag side={o.side} />
                </td>
                {!isTrades && <td className="px-3 py-2.5 capitalize text-slate-300">{o.type}</td>}
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{fmtPrice(o.price)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{fmtQty(o.qty)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">{fmtQty(o.total)}</td>
                {!isTrades && (
                  <td className="px-3 py-2.5">
                    <StatusTag o={o} />
                  </td>
                )}
                {!isTrades && tab === "open" && (
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onCancel(o)}
                      data-testid={`cancel-${o.id}`}
                      className="rounded-md border border-[#F6465D]/50 px-2.5 py-1 text-xs text-[#F6465D] hover:bg-[#F6465D] hover:text-white"
                    >
                      Cancel
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500" data-testid="orders-empty">
            No records.
          </div>
        )}
      </div>
    </div>
  );
}
