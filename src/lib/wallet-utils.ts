// 资产折算纯函数（便于单测）：余额 -> USD 估值 + 总资产（USD / BTC 计价）。
import type { WalletBalanceRow } from "../api/client";

export interface AssetValuation {
  asset: string;
  available: number;
  frozen: number;
  total: number;
  usdValue: number;
}

export interface PortfolioValuation {
  rows: AssetValuation[];
  totalUsd: number;
  totalBtc: number;
}

const DEFAULT_PRICES: Record<string, number> = { USDT: 1 };

/** 以 USDT 为本位折算各资产价值，并汇总总资产。 */
export function valueAssets(
  balances: WalletBalanceRow[],
  prices: { btcUsdt: number; ethUsdt: number } & Record<string, number>,
): PortfolioValuation {
  const priceOf = (asset: string): number => {
    if (asset === "BTC") return prices.btcUsdt ?? 0;
    if (asset === "ETH") return prices.ethUsdt ?? 0;
    return DEFAULT_PRICES[asset] ?? prices[asset] ?? 0;
  };
  const rows = balances.map((b) => {
    const total = b.available + b.frozen + (b.withdraw_frozen ?? 0);
    return {
      asset: b.asset,
      available: b.available,
      frozen: b.frozen + (b.withdraw_frozen ?? 0),
      total,
      usdValue: total * priceOf(b.asset),
    };
  });
  const totalUsd = rows.reduce((s, r) => s + r.usdValue, 0);
  return { rows, totalUsd, totalBtc: (prices.btcUsdt ?? 0) > 0 ? totalUsd / prices.btcUsdt : 0 };
}
