// 下单面板（模拟撮合）
// - Buy/Sell Tab + Limit/Market 类型切换；
// - 百分比滑条与 25/50/75/100 快捷档，按可用余额反算数量；
// - 实时校验（价格/数量/最小名义额/余额）+ 预估交易额；
// - 提交为本地模拟撮合（600ms 延迟），成功后回调 onPlaced 并弹 toast。
//   接真实链时把 submit() 替换为合约 writeContract / 后端 API 即可。

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { cn } from "../../lib/utils";
import { fmtPrice, fmtQty } from "../../lib/format";
import { useMockBalances } from "../../hooks/use-mock-balances";
import { useToast } from "../Toast";

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";

export interface SimulatedOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  qty: number;
  total: number;
  ts: number;
}

interface Props {
  symbol: string; // BTCUSDT
  lastPrice?: number; // 行情最新价（市价单成交参考价）
  onPlaced?: (order: SimulatedOrder) => void;
}

const MIN_NOTIONAL = 5; // 最小名义交易额（USDT）
const QTY_STEP = 0.00001; // 数量精度（BTC 5 位小数）
const PCT_PRESETS = [25, 50, 75, 100] as const;

function roundQty(q: number): number {
  return Math.floor(q / QTY_STEP) * QTY_STEP;
}

export function OrderPanel({ symbol, lastPrice, onPlaced }: Props) {
  const toast = useToast();
  const { isConnected } = useAccount();
  const balances = useMockBalances();

  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [priceStr, setPriceStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [pct, setPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const base = symbol.replace(/USDT$/, "");
  const isBuy = side === "buy";
  const available = balances ? (isBuy ? balances.usdt : balances.btc) : 0;

  // 成交参考价：限价=输入价；市价=最新行情价
  const limitPrice = parseFloat(priceStr) || 0;
  const effectivePrice = orderType === "limit" ? limitPrice : lastPrice ?? 0;
  const qty = parseFloat(qtyStr) || 0;
  const total = effectivePrice * qty;

  // 校验
  const errors = useMemo(() => {
    const list: string[] = [];
    if (orderType === "limit" && !(limitPrice > 0)) list.push("Enter a valid price");
    if (!(qty > 0)) list.push("Enter an amount");
    else {
      if (total < MIN_NOTIONAL) list.push(`Min order size ${MIN_NOTIONAL} USDT`);
      if (isBuy && total > available) list.push(`Insufficient ${available.toFixed(2)} USDT`);
      if (!isBuy && qty > available) list.push(`Insufficient ${base}`);
    }
    return list;
  }, [orderType, limitPrice, qty, total, available, isBuy, base]);
  const valid = errors.length === 0 && isConnected;

  // 百分比 → 数量：买入按可用 USDT 折算，卖出直接按持仓数量
  const applyPct = (p: number) => {
    setPct(p);
    if (!isConnected || !balances || p <= 0) return;
    let q = 0;
    if (isBuy) {
      if (!(effectivePrice > 0)) return;
      q = roundQty((available * p) / 100 / effectivePrice);
    } else {
      q = roundQty((available * p) / 100);
    }
    setQtyStr(q > 0 ? String(+q.toFixed(5)) : "");
  };

  const reset = () => {
    setQtyStr("");
    setPct(0);
  };

  // 模拟提交：接 Web3 合约时替换为 writeContract；接后端时替换为 api.postSpotOrder
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 600)); // 模拟网络/上链延迟
      const order: SimulatedOrder = {
        id: `SIM-${Date.now().toString(36).toUpperCase()}`,
        symbol,
        side,
        type: orderType,
        price: effectivePrice,
        qty,
        total,
        ts: Date.now(),
      };
      toast.success(`${isBuy ? "Buy" : "Sell"} order filled (simulated) · ${order.id}`);
      onPlaced?.(order);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Buy/Sell Tab */}
      <div className="grid grid-cols-2 border-b border-border">
        {(["buy", "sell"] as const).map((s) => {
          const active = side === s;
          return (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                reset();
              }}
              className={cn(
                "relative cursor-pointer py-2.5 text-[13px] font-semibold capitalize transition-colors",
                active ? (s === "buy" ? "text-buy" : "text-sell") : "text-muted hover:text-foreground"
              )}
            >
              {s}
              {active && (
                <span className={cn("absolute inset-x-6 bottom-0 h-0.5 rounded-full", s === "buy" ? "bg-buy" : "bg-sell")} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {/* Limit / Market 切换 */}
        <div className="flex gap-1 rounded-lg bg-panel-2/50 p-0.5">
          {(["limit", "market"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setOrderType(t);
                reset();
              }}
              className={cn(
                "flex-1 cursor-pointer rounded-md py-1 text-xs font-medium capitalize transition-colors",
                orderType === t ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 可用余额 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Available</span>
          <span className="font-mono tabular-nums text-foreground">
            {isConnected ? `${fmtQty(available)} ${isBuy ? "USDT" : base}` : "Connect wallet first"}
          </span>
        </div>

        {/* 价格输入（市价单只读展示最新价） */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Price (USDT)
          {orderType === "limit" ? (
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
            />
          ) : (
            <div className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-panel-2/40 px-3 font-mono text-sm tabular-nums text-muted">
              Market
              <span className="text-foreground">{lastPrice !== undefined ? fmtPrice(lastPrice) : "--"}</span>
            </div>
          )}
        </label>

        {/* 数量输入 */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Amount ({base})
          <input
            inputMode="decimal"
            placeholder={`0.00000`}
            value={qtyStr}
            onChange={(e) => {
              setQtyStr(e.target.value);
              setPct(0);
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
          />
        </label>

        {/* 百分比滑条 + 快捷档 */}
        <div className="flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={25}
            value={pct}
            onChange={(e) => applyPct(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full accent-accent bg-panel-2"
            aria-label="Percentage of available balance"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {PCT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => applyPct(p)}
                className={cn(
                  "cursor-pointer rounded-md border py-1 text-[11px] font-medium transition-colors",
                  pct === p
                    ? "border-accent bg-tag-bg text-accent"
                    : "border-border text-muted hover:border-accent/50 hover:text-foreground"
                )}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* 预估交易额 */}
        <div className="flex items-center justify-between rounded-lg bg-panel-2/30 px-3 py-2 text-xs">
          <span className="text-muted">Est. Total</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {total > 0 ? `${fmtPrice(total)} USDT` : "--"}
          </span>
        </div>

        {/* 校验错误 */}
        {errors.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-sell">
            {errors.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        )}

        {/* 提交按钮：买入实心绿底黑字 / 卖出实心红底白字（AGENTS.md 规范） */}
        <button
          onClick={submit}
          disabled={!valid || submitting}
          className={cn(
            "mt-auto h-10 cursor-pointer rounded-lg text-sm font-semibold transition-all",
            !isConnected || submitting || errors.length > 0
              ? "cursor-not-allowed opacity-50"
              : isBuy
                ? "bg-buy text-black hover:bg-buy/90"
                : "bg-sell text-white hover:bg-sell/90"
          )}
        >
          {!isConnected
            ? "Connect Wallet"
            : submitting
              ? "Placing..."
              : `${isBuy ? "Buy" : "Sell"} ${base}`}
        </button>
      </div>
    </div>
  );
}
