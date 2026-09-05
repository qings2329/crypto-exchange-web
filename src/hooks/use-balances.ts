// 真实账户余额 hook：调用后端 /api/v1/futures/wallet/balances（F4：uid 取 token），
// 替代 use-mock-balances 的确定性伪余额。通过 react-query 缓存，15s 自动刷新。
import { useQuery } from "@tanstack/react-query";
import { api, type WalletBalanceRow } from "../api/client";

export type { WalletBalanceRow };

export interface WalletBalances {
  rows: WalletBalanceRow[];
  /** 按资产取可用余额；不存在的资产返回 0。 */
  availableOf: (asset: string) => number;
  /** 按资产取冻结余额；不存在的资产返回 0。 */
  frozenOf: (asset: string) => number;
}

const EMPTY: WalletBalances = {
  rows: [],
  availableOf: () => 0,
  frozenOf: () => 0,
};

export function useBalances(): WalletBalances {
  const { data } = useQuery<WalletBalanceRow[]>({
    queryKey: ["wallet-balance"],
    queryFn: () => api.futuresWalletBalance() as Promise<WalletBalanceRow[]>,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const rows = data ?? [];
  if (rows.length === 0) return EMPTY;
  const idx = new Map(rows.map((r) => [r.asset, r]));
  return {
    rows,
    availableOf: (asset) => idx.get(asset)?.available ?? 0,
    frozenOf: (asset) => idx.get(asset)?.frozen ?? 0,
  };
}
