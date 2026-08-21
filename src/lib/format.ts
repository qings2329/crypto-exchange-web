// 数字/时间格式化（交易终端场景：tabular-nums 防抖动）。

/** 自适应精度价格：>=1000 保留 2 位，>=1 保留 2~4 位，<1 保留有效数字 */
export function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "--";
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toPrecision(4).replace(/(\.\d*?[1-9])0+$/, "$1");
}

/** 数量：保留 4 位有效小数并千分位 */
export function fmtQty(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** 百分比：带符号两位小数 */
export function fmtPercent(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** HH:MM:SS（本地时区） */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
