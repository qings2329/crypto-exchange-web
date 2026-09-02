// 永续合约计算纯函数（便于单测）。
// 口径对齐 Go 后端 crypto-exchange/internal/futures：
//   - 维持保证金率按名义价值分档（DefaultMaintenanceTiers），逐腿各自取档而非按账户总值；
//   - 逐仓与全仓共用同一套方程，区别只在「可用于吸收亏损的保证金」是仓位保证金还是共享池。

export type PerpSide = "long" | "short";

/** 保证金模式：逐仓（仓位独立保证金）/ 全仓（同用户同交易对共享保证金池） */
export type MarginMode = "isolated" | "cross";

/**
 * 归一化持仓方向。Go 的 PosSide 无 json tag，序列化为数字（0=Long / 1=Short）；
 * mock 网关用字符串。两种契约都接受。
 */
export function parsePosSide(v: number | string | undefined | null): PerpSide {
  return v === 1 || v === "short" ? "short" : "long";
}

/**
 * 归一化保证金模式。Go 的 MarginMode 无 json tag，序列化为数字（0=Isolated / 1=Cross）；
 * mock 网关用字符串。两种契约都接受。
 */
export function parseMarginMode(v: number | string | undefined | null): MarginMode {
  return v === 1 || v === "cross" ? "cross" : "isolated";
}

/** 维持保证金分档（对齐 Go DefaultMaintenanceTiers，名义价值以 USDT 计） */
export const MAINTENANCE_TIERS = [
  { upToNotional: 100_000, rate: 0.005 },
  { upToNotional: 1_000_000, rate: 0.01 },
  { upToNotional: 5_000_000, rate: 0.02 },
  { upToNotional: Number.POSITIVE_INFINITY, rate: 0.025 },
] as const;

/** 最低档维持保证金率（MMR），无名义价值上下文时的兜底 */
export const MMR = 0.005;

/** 按名义价值取维持保证金率。逐腿各自取档，不用账户总名义值。 */
export function maintenanceMarginRate(notional: number): number {
  if (!(notional > 0)) return MMR;
  for (const t of MAINTENANCE_TIERS) {
    if (notional <= t.upToNotional) return t.rate;
  }
  return MMR;
}

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

/** 维持保证金 = 名义价值 × 该名义价值对应档位的维持率 */
export function calcMaintenanceMargin(notional: number): number {
  return notional > 0 ? notional * maintenanceMarginRate(notional) : 0;
}

/**
 * 预估强平价格：解「可用于吸收亏损的保证金 + 本腿浮动盈亏 = 维持保证金总额」关于标记价 P 的方程。
 *   多头：E + qty×(P - entry) = M_other + qty×P×MMR
 *   空头：E + qty×(entry - P) = M_other + qty×P×MMR
 * 逐仓即 otherMaintenance = 0、marginBase 只含本仓位保证金的特例。
 *
 * MMR 档位按开仓名义价值取（标记价本身是待解未知数，只能按 entry 取值），
 * 与 Go Position.LiqPrice 的展示口径一致。
 *
 * @param marginBase 可用于吸收亏损的保证金（不含本腿浮动盈亏）
 *   逐仓 = 该仓位保证金；全仓 = 共享池 Balance + 同池其他腿浮动盈亏
 * @param otherMaintenance 同池其他腿已占用的维持保证金（逐仓为 0）
 */
export function calcLiquidationPrice(
  side: PerpSide,
  entryPrice: number,
  qty: number,
  marginBase: number,
  otherMaintenance: number = 0
): number {
  if (!(entryPrice > 0) || !(qty > 0)) return 0;
  const mmr = maintenanceMarginRate(entryPrice * qty);
  const notionalAtEntry = entryPrice * qty;
  return side === "long"
    ? (notionalAtEntry + otherMaintenance - marginBase) / (qty * (1 - mmr))
    : (marginBase + notionalAtEntry - otherMaintenance) / (qty * (1 + mmr));
}

/**
 * 保证金率 = 维持保证金总额 / 保证金余额 × 100%（100% 即触发强平）。
 * 与 Go 的 MarginRatio = 权益 / 维持保证金 互为倒数。
 * 余额 ≤ 0 视为已爆仓（返回 Infinity，UI 显示 "--"）。
 */
export function calcMarginRatio(maintenanceMargin: number, marginBalance: number): number {
  if (!(marginBalance > 0) || !(maintenanceMargin > 0)) return Number.POSITIVE_INFINITY;
  return (maintenanceMargin / marginBalance) * 100;
}

/** 单腿持仓风险视图的入参 */
export interface PositionRiskInput {
  side: PerpSide;
  entryPrice: number;
  qty: number;
  markPrice: number;
  leverage: number;
  /** 仓位保证金：逐仓即该仓位锁定保证金；全仓下后端恒为 0 */
  positionMargin: number;
  mode: MarginMode;
  /** 全仓共享池余额（该用户在该交易对的 CrossAccount.Balance，含已实现盈亏与资金费） */
  crossPool: number;
  /** 同池其他腿的浮动盈亏之和 */
  otherPnl: number;
  /** 同池其他腿的标记名义价值之和（用于折算它们的维持保证金） */
  otherNotional: number;
}

export interface PositionRisk {
  /** 本次快照所基于的标记价（回显用，保证 PNL 与展示价格一致） */
  markPrice: number;
  /** 本腿浮动盈亏 */
  pnl: number;
  /** 收益率%（以初始保证金为分母，全仓亦然） */
  roePct: number;
  /** 预估强平价（多空双腿对冲时无解析解，返回 0，UI 显示 N/A） */
  liquidationPrice: number;
  /** 保证金率%（Infinity 表示已爆仓） */
  marginRatio: number;
  /** 该模式下实际生效的保证金余额（账户权益） */
  marginBalance: number;
  /** 该模式下实际生效的维持保证金总额 */
  maintenanceMargin: number;
}

/**
 * 按保证金模式计算单个仓位的强平价与保证金率。
 *
 * - 逐仓：余额 = 仓位保证金 + 本仓盈亏；维持保证金 = 本仓名义值 × MMR。
 *   仓位之间互不影响，亏损上限就是这笔保证金。
 * - 全仓：余额 = 共享池 + 同池所有腿盈亏；维持保证金 = 同池所有腿名义值 × MMR。
 *   其他腿的浮亏会侵蚀本腿的抗风险空间，它们的维持保证金也要一并满足。
 *
 * 保证金率的 MMR 按标记价名义值取档（对齐 Go IsLiquidatable 的真实触发口径），
 * 强平价按开仓名义值取档（对齐 Go LiqPrice 的展示口径）。
 */
export function calcPositionRisk(i: PositionRiskInput): PositionRisk {
  const pnl = calcPnl(i.side, i.entryPrice, i.markPrice, i.qty);
  const notionalAtMark = i.markPrice * i.qty;

  // 全仓共享池缺失（后端重启会丢失 cross book）时退回「杠杆反推保证金」，
  // 因为全仓的 Position.Margin 恒为 0，直接拿来算会得到「立即强平」的荒谬值。
  const isolatedMargin = i.positionMargin > 0 ? i.positionMargin : (i.entryPrice * i.qty) / Math.max(1, i.leverage);
  const useCross = i.mode === "cross" && i.crossPool > 0;

  const marginBase = useCross ? i.crossPool + i.otherPnl : isolatedMargin;
  const otherMaintenance = useCross ? calcMaintenanceMargin(i.otherNotional) : 0;
  const marginBalance = marginBase + pnl;
  const maintenanceMargin = calcMaintenanceMargin(notionalAtMark + (useCross ? i.otherNotional : 0));

  return {
    markPrice: i.markPrice,
    pnl,
    roePct: isolatedMargin > 0 ? (pnl / isolatedMargin) * 100 : 0,
    liquidationPrice: calcLiquidationPrice(i.side, i.entryPrice, i.qty, marginBase, otherMaintenance),
    marginRatio: calcMarginRatio(maintenanceMargin, marginBalance),
    marginBalance,
    maintenanceMargin,
  };
}
