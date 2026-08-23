import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

// 交易对下拉可选列表（与 mock kline 服务任意 symbol 均生成模拟行情一致）。
// 生产环境应由 /api/v1/market/symbols 下发；此处用常用 USDT 交易对兜底。
export const TRADE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "DOTUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "MATICUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "TONUSDT",
  "NEARUSDT",
  "APTUSDT",
];

// 交易对选择器：点击展开列表（含搜索过滤），选择后回调 onChange(symbol)。
// 样式贴合币安暗色终端：紧凑、下划线高亮当前项、绝对定位浮层。
export function SymbolSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (symbol: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 展开时重置搜索；过滤不区分大小写按子串匹配。
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return TRADE_SYMBOLS;
    return TRADE_SYMBOLS.filter((s) => s.includes(q));
  }, [query]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent"
      >
        <span className="font-mono">{value}</span>
        <span className={cn("transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {/* 搜索框 */}
          <div className="px-2 pb-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("trade.searchSymbol")}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          <ul className="max-h-60 overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-center text-[11px] text-muted">{t("common.noMatch")}</li>
            ) : (
              filtered.map((s) => (
                <li key={s} role="option" aria-selected={s === value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-1.5 text-left font-mono text-xs text-foreground transition-colors hover:bg-panel-2/60",
                      s === value && "font-semibold text-accent"
                    )}
                  >
                    {s}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
