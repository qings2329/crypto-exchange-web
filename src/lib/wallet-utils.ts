// 资产折算纯函数（便于单测）：余额 -> USD 估值 + 总资产（USD / BTC 计价）。
import type { MockBalances } from "../hooks/use-mock-balances";

export interface AssetValuation {
  asset: "USDT" | "BTC" | "ETH";
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

/** 以 USDT 为本位折算各资产价值，并汇总总资产。 */
export function valueAssets(balances: MockBalances, prices: { btcUsdt: number; ethUsdt: number }): PortfolioValuation {
  const defs: { asset: AssetValuation["asset"]; available: number; frozen: number; priceUsd: number }[] = [
    { asset: "USDT", available: balances.usdt - balances.frozenUsdt, frozen: balances.frozenUsdt, priceUsd: 1 },
    { asset: "BTC", available: balances.btc - balances.frozenBtc, frozen: balances.frozenBtc, priceUsd: prices.btcUsdt },
    { asset: "ETH", available: balances.eth - balances.frozenEth, frozen: balances.frozenEth, priceUsd: prices.ethUsdt },
  ];
  const rows = defs.map((d) => ({
    asset: d.asset,
    available: d.available,
    frozen: d.frozen,
    total: d.available + d.frozen,
    usdValue: (d.available + d.frozen) * d.priceUsd,
  }));
  const totalUsd = rows.reduce((s, r) => s + r.usdValue, 0);
  return { rows, totalUsd, totalBtc: prices.btcUsdt > 0 ? totalUsd / prices.btcUsdt : 0 };
}
