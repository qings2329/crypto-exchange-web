import { useEffect, useRef, useState } from "react";
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

// 交易对选择器：点击展开列表，选择后回调 onChange(symbol)。
// 样式贴合币安暗色终端：紧凑、下划线高亮当前项、绝对定位浮层。
export function SymbolSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent"
      >
        <span className="font-mono">{value}</span>
        <span className={cn("transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-30 mt-1 max-h-72 w-44 overflow-auto rounded-md border border-[#2B3139] bg-[#1E2329] py-1 shadow-lg"
        >
          {TRADE_SYMBOLS.map((s) => (
            <li key={s} role="option" aria-selected={s === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left font-mono text-xs text-[#EAECEF] transition-colors hover:bg-[#2B3139]/60",
                  s === value && "font-semibold text-[#FCD535]"
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
