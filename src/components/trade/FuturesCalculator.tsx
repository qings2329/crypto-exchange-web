// 合约计算器：多头/空头 + 开仓价/目标价/杠杆/数量 → 预估收益 PNL、收益率 ROE%、预估强平价。
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { Modal } from "../Modal";
import { calcLiquidationPrice, calcPnl, calcRoe } from "../../lib/futures-math";
import type { PerpSide } from "../../lib/futures-math";

export function FuturesCalculator({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [side, setSide] = useState<PerpSide>("long");
  const [entryStr, setEntryStr] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [levStr, setLevStr] = useState("20");
  const [qtyStr, setQtyStr] = useState("0.1");

  const entry = parseFloat(entryStr) || 0;
  const target = parseFloat(targetStr) || 0;
  const leverage = Math.min(125, Math.max(1, parseFloat(levStr) || 1));
  const qty = parseFloat(qtyStr) || 0;

  const result = useMemo(() => {
    if (!(entry > 0) || !(target > 0) || !(qty > 0)) return null;
    return {
      pnl: calcPnl(side, entry, target, qty),
      roe: calcRoe(side, entry, target, leverage),
      liq: calcLiquidationPrice(side, entry, leverage),
    };
  }, [side, entry, target, leverage, qty]);

  const num = (label: string, value: string, onChange: (v: string) => void, testid: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        placeholder="0.00"
        className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none transition-colors focus:border-accent"
      />
    </label>
  );

  return (
    <Modal title={t("trade.calculator.title")} onClose={onClose} width={440}>
      <div className="flex flex-col gap-4">
        {/* Long / Short */}
        <div className="grid grid-cols-2 gap-2">
          {(["long", "short"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              data-testid={`calc-${s}`}
              className={cn(
                "cursor-pointer rounded-lg border py-2 text-sm font-semibold capitalize transition-colors",
                side === s
                  ? s === "long"
                    ? "border-buy bg-buy/10 text-buy"
                    : "border-sell bg-sell/10 text-sell"
                  : "border-border text-muted hover:text-foreground"
              )}
            >
              {s === "long" ? t("trade.calculator.longBuy") : t("trade.calculator.shortSell")}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {num(t("trade.calculator.entryPrice"), entryStr, setEntryStr, "calc-entry")}
          {num(t("trade.calculator.targetPrice"), targetStr, setTargetStr, "calc-target")}
          {num(t("trade.calculator.leverage"), levStr, setLevStr, "calc-leverage")}
          {num(t("trade.calculator.quantity"), qtyStr, setQtyStr, "calc-qty")}
        </div>

        {/* 结果 */}
        {result && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel-2/40 p-3" data-testid="calc-result">
            <Row
              label={t("trade.calculator.estPnl")}
              value={`${result.pnl >= 0 ? "+" : ""}${result.pnl.toFixed(2)} USDT`}
              cls={result.pnl >= 0 ? "text-buy" : "text-sell"}
              testid="calc-pnl"
            />
            <Row
              label={t("trade.calculator.roe")}
              value={`${result.roe >= 0 ? "+" : ""}${result.roe.toFixed(2)}%`}
              cls={result.roe >= 0 ? "text-buy" : "text-sell"}
              testid="calc-roe"
            />
            <Row label={t("trade.calculator.estLiqPrice")} value={result.liq.toFixed(2)} cls="text-accent" testid="calc-liq" />
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          {t("trade.calculator.disclaimer")}
        </p>
      </div>
    </Modal>
  );
}

function Row({ label, value, cls, testid }: { label: string; value: string; cls: string; testid: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono font-semibold tabular-nums", cls)} data-testid={testid}>
        {value}
      </span>
    </div>
  );
}
