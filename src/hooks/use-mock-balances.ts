// 模拟钱包余额（演示用途）：由地址确定性派生 USDT / BTC 数额，
// 同一地址在任何组件中取值一致；真实余额可替换为 useBalance + ERC20 readHooks。

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "../lib/auth";

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
  eth: number;
  /** 冻结金额（挂单占用），可用 = 总额 - 冻结 */
  frozenUsdt: number;
  frozenBtc: number;
  frozenEth: number;
}

export function mockBalancesFor(address: string): MockBalances {
  const s = seedFrom(address.toLowerCase());
  // 注意用 >>>（无符号右移）：s 可能超过 2^31，>> 会按有符号处理产生负数
  const usdt = 5_000 + (s % 45_000) + ((s >>> 8) % 100) / 100;
  const btc = 0.05 + ((s >>> 4) % 900) / 1_000;
  const eth = 0.8 + ((s >>> 6) % 1_200) / 100;
  // 冻结比例确定性派生：USDT 0~8%，BTC/ETH 0~15%
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
  const frozenUsdt = r2(usdt * ((s >>> 12) % 800) / 10_000);
  const frozenBtc = r4(btc * ((s >>> 16) % 1500) / 10_000);
  const frozenEth = r4(eth * ((s >>> 20) % 1500) / 10_000);
  return {
    usdt: r2(usdt),
    btc: r4(btc),
    eth: r4(eth),
    frozenUsdt,
    frozenBtc,
    frozenEth,
  };
}

export function useMockBalances(): MockBalances | null {
  const { address } = useAccount();
  const { uid } = useAuth();
  return useMemo(() => {
    // 已连接钱包用地址派生；仅登录未连接时用会话 uid 派生（资产总览无需强制连接钱包）。
    const seed = address ?? (uid ? `session-${uid}` : null);
    return seed ? mockBalancesFor(seed) : null;
  }, [address, uid]);
}
