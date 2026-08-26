// 交易偏好弹窗（顶部齿轮）：K 线默认周期 + 涨跌幅基准，二选一持久化到 LocalStorage。
// 点击外部自动收起（同 LanguageMenu 模式）。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { INTERVALS } from "./TradingViewChart";
import { useTradePrefs, type ChangeBasis } from "../../store/trade-prefs-store";
import { cn } from "../../lib/utils";

const BASES: { value: ChangeBasis; key: string }[] = [
  { value: "24h", key: "prefs.basis24h" },
  { value: "1h", key: "prefs.basis1h" },
  { value: "today", key: "prefs.basisToday" },
];

export function TradePrefsPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const interval = useTradePrefs((s) => s.interval);
  const changeBasis = useTradePrefs((s) => s.changeBasis);
  const setInterval = useTradePrefs((s) => s.setInterval);
  const setChangeBasis = useTradePrefs((s) => s.setChangeBasis);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const seg = (active: boolean) =>
    cn(
      "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
      active ? "border-accent/60 bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("prefs.title")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2/60 hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div
          data-testid="trade-prefs"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {t("prefs.title")}
          </div>

          {/* K 线周期 */}
          <div className="mb-3">
            <div className="mb-1.5 text-xs text-muted">{t("prefs.klineInterval")}</div>
            <div className="flex gap-1">
              {INTERVALS.map((i) => (
                <button key={i} onClick={() => setInterval(i)} className={seg(i === interval)}>
                  {i.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 涨跌幅基准 */}
          <div>
            <div className="mb-1.5 text-xs text-muted">{t("prefs.changeBasis")}</div>
            <div className="flex gap-1">
              {BASES.map((b) => (
                <button key={b.value} onClick={() => setChangeBasis(b.value)} className={seg(b.value === changeBasis)}>
                  {t(b.key)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
