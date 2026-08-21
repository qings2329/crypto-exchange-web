// OTC 纯函数：倒计时格式化、金额换算。（过滤/排序由服务端 /otc/advertisements 完成）
/** 倒计时格式化：剩余 ms → "14:32"；已过期 → "00:00" */
export function fmtCountdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 法币金额 ↔ 币数量（单价固定时互算，qty 保留 2 位小数） */
export function qtyFromTotal(total: number, price: number): number {
  if (!(price > 0) || !(total > 0)) return 0;
  return Math.floor((total / price) * 100) / 100;
}
export function totalFromQty(qty: number, price: number): number {
  if (!(price > 0) || !(qty > 0)) return 0;
  return Math.floor(qty * price * 100) / 100;
}

/** 剩余毫秒数（基于服务端 expire_at ISO 时间） */
export function msLeftFrom(expireAt: string | undefined, now: number): number {
  if (!expireAt) return 0;
  return Date.parse(expireAt) - now;
}
