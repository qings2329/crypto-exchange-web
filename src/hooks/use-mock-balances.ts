// 模拟钱包余额（演示用途）：由地址确定性派生 USDT / BTC 数额，
// 同一地址在任何组件中取值一致；真实余额可替换为 useBalance + ERC20 readHooks。

import { useMemo } from "react";
import { useAccount } from "wagmi";

function seedFrom(address: string): number {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) {
    h ^= address.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface MockBalances {
  usdt: number;
  btc: number;
}

export function mockBalancesFor(address: string): MockBalances {
  const s = seedFrom(address.toLowerCase());
  // 注意用 >>>（无符号右移）：s 可能超过 2^31，>> 会按有符号处理产生负数
  const usdt = 5_000 + (s % 45_000) + ((s >>> 8) % 100) / 100;
  const btc = 0.05 + ((s >>> 4) % 900) / 1_000;
  return { usdt: Math.round(usdt * 100) / 100, btc: Math.round(btc * 10_000) / 10_000 };
}

export function useMockBalances(): MockBalances | null {
  const { address } = useAccount();
  return useMemo(() => (address ? mockBalancesFor(address) : null), [address]);
}
