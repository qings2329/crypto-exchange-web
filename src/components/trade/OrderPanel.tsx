// 下单面板（模拟撮合）
// - Buy/Sell Tab + Limit/Market 类型切换；
// - 百分比滑条与 25/50/75/100 快捷档，按可用余额反算数量；
// - 实时校验（价格/数量/最小名义额/余额）+ 预估交易额；
// - 提交写入 orders-store：市价单立即 filled，限价单进入当前委托（open），
//   行情穿越限价时自动撮合。接真实链时把 submit() 替换为合约 writeContract / 后端 API 即可。

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { fmtPrice, fmtQty } from "../../lib/format";
import { useMockBalances } from "../../hooks/use-mock-balances";
import { useOrdersStore, type TradeOrder } from "../../store/orders-store";
import { leverageOf, marginModeOf, useFuturesStore } from "../../store/futures-store";
import { LeverageMarginBar } from "./LeverageMarginBar";
import { useToast } from "../Toast";
import { useGuardedAction } from "../../hooks/use-guarded-action";

export type OrderSide = TradeOrder["side"];
export type OrderType = TradeOrder["type"];

interface Props {
  symbol: string; // BTCUSDT
  lastPrice?: number; // 行情最新价（市价单成交参考价）
  /** spot=现货下单；perp=永续合约开仓（显示杠杆栏，提交即开仓） */
  variant?: "spot" | "perp";
}

const MIN_NOTIONAL = 5; // 最小名义交易额（USDT）
const QTY_STEP = 0.00001; // 数量精度（BTC 5 位小数）
const PCT_PRESETS = [25, 50, 75, 100] as const;

function roundQty(q: number): number {
  return Math.floor(q / QTY_STEP) * QTY_STEP;
}

export function OrderPanel({ symbol, lastPrice, variant = "spot" }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { uid } = useAuth();
  const authed = !!uid; // 中心化交易所：以站内登录态为准（Web3/DEX 能力后续版本接入）
  const balances = useMockBalances();
  const place = useOrdersStore((s) => s.place);
  const openPosition = useFuturesStore((s) => s.open);
  const perp = variant === "perp";
  const leverage = useFuturesStore((s) => leverageOf(s, symbol));
  const marginMode = useFuturesStore((s) => marginModeOf(s, symbol));

  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [priceStr, setPriceStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [pct, setPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const base = symbol.replace(/USDT$/, "");
  const isBuy = side === "buy";
  // 合约双边均以 USDT 计保证金；现货卖出消耗币余额
  const available = balances ? (perp || isBuy ? balances.usdt : balances.btc) : 0;

  // 成交参考价：限价=输入价；市价=最新行情价
  const limitPrice = parseFloat(priceStr) || 0;
  const effectivePrice = orderType === "limit" ? limitPrice : lastPrice ?? 0;
  const qty = parseFloat(qtyStr) || 0;
  const total = effectivePrice * qty;

  // 校验
  const errors = useMemo(() => {
    const list: string[] = [];
    if (orderType === "limit" && !(limitPrice > 0)) list.push(t("orderPanel.invalidPrice"));
    if (!(qty > 0)) list.push(t("orderPanel.invalidAmount"));
    else if (perp) {
      // 合约：校验初始保证金（名义额/杠杆）不超过可用 USDT
      const margin = total / leverage;
      if (total < MIN_NOTIONAL) list.push(t("orderPanel.minSize", { min: MIN_NOTIONAL }));
      else if (margin > available) list.push(t("orderPanel.insufficientMargin", { balance: available.toFixed(2) }));
    } else {
      if (total < MIN_NOTIONAL) list.push(t("orderPanel.minSize", { min: MIN_NOTIONAL }));
      if (isBuy && total > available) list.push(t("orderPanel.insufficientUsdt", { balance: available.toFixed(2) }));
      if (!isBuy && qty > available) list.push(t("orderPanel.insufficientAsset", { asset: base }));
    }
    return list;
  }, [t, orderType, limitPrice, qty, total, available, isBuy, base, perp, leverage]);
  const valid = errors.length === 0 && authed;

  // 百分比 → 数量：买入按可用 USDT 折算，卖出直接按持仓数量
  const applyPct = (p: number) => {
    setPct(p);
    if (!authed || !balances || p <= 0) return;
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
      if (perp) {
        // 永续合约：提交即按参考价开仓（模拟即时成交）
        openPosition({
          symbol,
          side: isBuy ? "long" : "short",
          leverage,
          marginMode,
          entryPrice: effectivePrice,
          qty,
          margin: total / leverage,
        });
        toast.success(t("orderPanel.toastPositionOpened", { side: t(isBuy ? "orderPanel.openLong" : "orderPanel.openShort"), lev: leverage }));
        reset();
        return;
      }
      const isMarket = orderType === "market";
      const order: TradeOrder = {
        id: `SIM-${Date.now().toString(36).toUpperCase()}`,
        symbol,
        side,
        type: orderType,
        price: effectivePrice,
        qty,
        total,
        ts: Date.now(),
        // 市价单按最新价立即成交；限价单挂入当前委托，行情穿越时自动撮合
        status: isMarket ? "filled" : "open",
        settledTs: isMarket ? Date.now() : undefined,
      };
      place(order);
      const sideLabel = t(isBuy ? "orderPanel.buy" : "orderPanel.sell");
      toast.success(
        isMarket
          ? t("orderPanel.toastOrderFilled", { side: sideLabel, id: order.id })
          : t("orderPanel.toastOrderPlaced", { side: sideLabel, id: order.id })
      );
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  // 防重复下单：300ms 防抖合并连点 + 1s 接口冷却（冷却表跨重挂载共享）
  const guarded = useGuardedAction(() => void submit(), {
    key: "order-submit",
    cooldownMs: 1000,
    debounceMs: 300,
  });

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
                "relative cursor-pointer py-2.5 text-[13px] font-semibold transition-colors",
                active ? (s === "buy" ? "text-buy" : "text-sell") : "text-muted hover:text-foreground"
              )}
            >
              {t(`orderPanel.${s}`)}
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
          {(["limit", "market"] as const).map((ot) => (
            <button
              key={ot}
              onClick={() => {
                setOrderType(ot);
                reset();
              }}
              className={cn(
                "flex-1 cursor-pointer rounded-md py-1 text-xs font-medium transition-colors",
                orderType === ot ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              {t(`orderPanel.${ot}`)}
            </button>
          ))}
        </div>

        {/* 杠杆与保证金设置栏（仅永续合约模式） */}
        {perp && <LeverageMarginBar symbol={symbol} />}

        {/* 可用余额 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{perp ? t("orderPanel.availableMargin") : t("orderPanel.available")}</span>
          <span className="font-mono tabular-nums text-foreground">
            {authed ? `${fmtQty(available)} USDT` : t("orderPanel.loginFirst")}
          </span>
        </div>

        {/* 价格输入（市价单只读展示最新价） */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("orderPanel.price")}
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
              {t("orderPanel.market")}
              <span className="text-foreground">{lastPrice !== undefined ? fmtPrice(lastPrice) : "--"}</span>
            </div>
          )}
        </label>

        {/* 数量输入 */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("orderPanel.amount")} (${base})`}
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
          <span className="text-muted">{t("orderPanel.total")}</span>
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

        {/* 提交按钮：买入实心绿底黑字 / 卖出实心红底白字（AGENTS.md 规范）；未登录跳转登录页 */}
        {authed ? (
          <button
            onClick={guarded.run}
            disabled={!valid || submitting || guarded.cooling}
            className={cn(
              "mt-auto h-10 cursor-pointer rounded-lg text-sm font-semibold transition-all",
              submitting || errors.length > 0
                ? "cursor-not-allowed opacity-50"
                : isBuy
                  ? "bg-buy text-black hover:bg-buy/90"
                  : "bg-sell text-white hover:bg-sell/90"
            )}
          >
            {submitting
              ? t("orderPanel.placing")
              : perp
                ? `${t(isBuy ? "orderPanel.openLong" : "orderPanel.openShort")} ${base}`
                : `${t(isBuy ? "orderPanel.buy" : "orderPanel.sell")} ${base}`}
          </button>
        ) : (
          <a
            href="#/login"
            className="mt-auto grid h-10 place-items-center rounded-lg bg-accent text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            {t("orderPanel.loginToTrade")}
          </a>
        )}
      </div>
    </div>
  );
}
