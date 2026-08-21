// 永续合约计算纯函数（便于单测）。
// 采用 Binance U 本位逐仓简化模型：维持保证金率取 tier-1 固定值。

export type PerpSide = "long" | "short";

/** 维持保证金率（MMR，tier-1 简化） */
export const MMR = 0.005;

/** 未实现盈亏：多头 (mark-entry)*qty；空头 (entry-mark)*qty */
export function calcPnl(side: PerpSide, entry: number, mark: number, qty: number): number {
  if (!(entry > 0) || !(mark > 0) || !(qty > 0)) return 0;
  const diff = side === "long" ? mark - entry : entry - mark;
  return diff * qty;
}

/** 收益率 ROE%（= PNL / 初始保证金）：多头 (目标/开仓-1)×杠杆；空头 (1-目标/开仓)×杠杆 */
export function calcRoe(side: PerpSide, entry: number, target: number, leverage: number): number {
  if (!(entry > 0) || !(target > 0) || !(leverage >= 1)) return 0;
  const move = side === "long" ? target / entry - 1 : 1 - target / entry;
  return move * leverage * 100;
}

/**
 * 预估强平价格（逐仓，全仓近似同式）：
 * 多头 liq = entry × (1 - 1/lev + MMR)；空头 liq = entry × (1 + 1/lev - MMR)
 */
export function calcLiquidationPrice(side: PerpSide, entry: number, leverage: number, mmr: number = MMR): number {
  if (!(entry > 0) || !(leverage >= 1)) return 0;
  return side === "long"
    ? entry * (1 - 1 / leverage + mmr)
    : entry * (1 + 1 / leverage - mmr);
}

/**
 * 保证金率 = 维持保证金 / 账户保证金余额 × 100%
 * marginBalance = 初始保证金 + 未实现盈亏；维持保证金 = 标记名义值 × MMR
 */
export function calcMarginRatio(
  pnl: number,
  initialMargin: number,
  notionalAtMark: number,
  mmr: number = MMR
): number {
  const marginBalance = initialMargin + pnl;
  if (!(marginBalance > 0) || !(notionalAtMark > 0)) return Number.POSITIVE_INFINITY;
  return ((notionalAtMark * mmr) / marginBalance) * 100;
}
