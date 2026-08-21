// OTC 纯函数：广告过滤/排序、倒计时格式化、金额换算。
import type { MerchantAd, OtcFiat, OtcSide, PayMethod } from "../store/otc-store";

export interface AdFilter {
  side: OtcSide;
  coin: string;
  fiat: OtcFiat;
  method: PayMethod | "all";
  /** 法币金额；空值表示不过滤 */
  amount?: number | null;
}

/** 按方向/币种/法币/支付方式/金额区间过滤 */
export function filterAds(ads: MerchantAd[], f: AdFilter): MerchantAd[] {
  return ads.filter(
    (a) =>
      a.side === f.side &&
      a.coin === f.coin &&
      a.fiat === f.fiat &&
      (f.method === "all" || a.methods.includes(f.method)) &&
      (f.amount == null || !Number.isFinite(f.amount) || (f.amount >= a.minLimit && f.amount <= a.maxLimit))
  );
}

/** 排序：买入按单价升（最便宜优先），卖出按单价降（最高价优先） */
export function sortAds(ads: MerchantAd[], priced: Map<string, number>): MerchantAd[] {
  return [...ads].sort((a, b) => {
    const pa = priced.get(a.id) ?? 0;
    const pb = priced.get(b.id) ?? 0;
    return a.side === "buy" ? pa - pb : pb - pa;
  });
}

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
