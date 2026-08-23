// 杠杆与保证金设置栏：逐仓/全仓切换弹窗、杠杆滑条弹窗（1-125x，高风险预警）、计算器入口。
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Modal } from "../Modal";
import { useFuturesStore, leverageOf, marginModeOf, type MarginMode } from "../../store/futures-store";
import { calcLiquidationPrice } from "../../lib/futures-math";
import { FuturesCalculator } from "./FuturesCalculator";

const LEV_PRESETS = [1, 5, 10, 20, 25, 50, 75, 100, 125] as const;
/** 高杠杆风险阈值：超过该倍数显示强风险提示 */
const HIGH_RISK_LEV = 20;

export function LeverageMarginBar({ symbol }: { symbol: string }) {
  const [modeModal, setModeModal] = useState(false);
  const [levModal, setLevModal] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const mode = useFuturesStore((s) => marginModeOf(s, symbol));
  const lev = useFuturesStore((s) => leverageOf(s, symbol));

  return (
    <div className="flex items-center gap-1.5" data-testid="leverage-bar">
      <button
        onClick={() => setModeModal(true)}
        data-testid="margin-mode-btn"
        className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        {mode === "isolated" ? "Isolated" : "Cross"}
      </button>
      <button
        onClick={() => setLevModal(true)}
        data-testid="leverage-btn"
        className={cn(
          "cursor-pointer rounded-md border px-2 py-1 text-xs font-bold transition-colors",
          lev > HIGH_RISK_LEV
            ? "border-sell/50 text-sell hover:bg-sell/10"
            : "border-border text-muted hover:border-accent/50 hover:text-foreground"
        )}
      >
        {lev}x
      </button>
      <button
        onClick={() => setCalcOpen(true)}
        data-testid="calculator-btn"
        aria-label="Open futures calculator"
        title="Futures Calculator"
        className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        Calc
      </button>

      {modeModal && <MarginModeModal symbol={symbol} current={mode} onClose={() => setModeModal(false)} />}
      {levModal && <LeverageModal symbol={symbol} current={lev} onClose={() => setLevModal(false)} />}
      {calcOpen && <FuturesCalculator onClose={() => setCalcOpen(false)} />}
    </div>
  );
}

function MarginModeModal({
  symbol,
  current,
  onClose,
}: {
  symbol: string;
  current: MarginMode;
  onClose: () => void;
}) {
  const setMarginMode = useFuturesStore((s) => s.setMarginMode);
  const [picked, setPicked] = useState<MarginMode>(current);

  const options: { key: MarginMode; title: string; desc: string }[] = [
    { key: "cross", title: "Cross", desc: "All cross margin balance is shared as collateral; liquidation may drain the whole account." },
    { key: "isolated", title: "Isolated", desc: "Margin is capped per position; max loss is the position's initial margin." },
  ];

  return (
    <Modal
      title={`Margin Mode · ${symbol}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            data-testid="margin-mode-confirm"
            onClick={() => {
              setMarginMode(symbol, picked);
              onClose();
            }}
          >
            Confirm
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => setPicked(o.key)}
            data-testid={`mode-${o.key}`}
            className={cn(
              "cursor-pointer rounded-lg border p-3 text-left transition-colors",
              picked === o.key ? "border-accent bg-tag-bg/40" : "border-border hover:border-accent/40"
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {o.title}
              {picked === o.key && <span className="text-xs font-medium text-accent">✓</span>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{o.desc}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function LeverageModal({ symbol, current, onClose }: { symbol: string; current: number; onClose: () => void }) {
  const setLeverage = useFuturesStore((s) => s.setLeverage);
  const [lev, setLev] = useState(current);
  const highRisk = lev > HIGH_RISK_LEV;
  // 距强平的价格波动幅度 ≈ 1/lev - MMR
  const liqMovePct = (1 / lev) * 100;

  return (
    <Modal
      title={`Adjust Leverage · ${symbol}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            data-testid="leverage-confirm"
            onClick={() => {
              setLeverage(symbol, lev);
              onClose();
            }}
          >
            Confirm
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Leverage</span>
          <span
            className={cn("font-mono text-2xl font-bold tabular-nums", highRisk ? "text-sell" : "text-accent")}
            data-testid="leverage-value"
          >
            {lev}x
          </span>
        </div>

        {/* 滑条 */}
        <input
          type="range"
          min={1}
          max={125}
          step={1}
          value={lev}
          onChange={(e) => setLev(Number(e.target.value))}
          data-testid="leverage-slider"
          aria-label="Leverage multiplier"
          className="pct-range h-1.5 w-full"
          style={{
            background: `linear-gradient(to right, var(--accent) ${((lev - 1) / 124) * 100}%, var(--panel-2) ${((lev - 1) / 124) * 100}%)`,
          }}
        />

        {/* 快捷档 */}
        <div className="grid grid-cols-5 gap-1.5">
          {LEV_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setLev(p)}
              data-testid={`lev-preset-${p}`}
              className={cn(
                "cursor-pointer rounded-md border py-1 text-[11px] font-medium transition-colors",
                lev === p ? "border-accent bg-tag-bg text-accent" : "border-border text-muted hover:border-accent/50"
              )}
            >
              {p}x
            </button>
          ))}
        </div>

        {/* 高杠杆风险预警 */}
        {highRisk ? (
          <div
            role="alert"
            data-testid="leverage-risk-warning"
            className="rounded-lg border border-sell/40 bg-sell/10 p-3 text-xs leading-relaxed text-sell"
          >
            ⚠ High risk: at {lev}x leverage, an adverse move of only ~{liqMovePct.toFixed(2)}% can trigger
            liquidation. Consider lower leverage.
          </div>
        ) : (
          <p className="text-xs text-muted">
            Estimated adverse move to liquidation: ~{liqMovePct.toFixed(2)}%
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 供计算器默认展示当前交易对与杠杆 */
export function currentLeverageFor(symbol: string): number {
  return leverageOf(useFuturesStore.getState(), symbol);
}

export function liqPreview(side: "long" | "short", entry: number, lev: number): number {
  return calcLiquidationPrice(side, entry, lev);
}
