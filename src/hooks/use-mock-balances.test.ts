// use-mock-balances 纯函数测试：余额派生确定性与资产取值。

import { describe, expect, it } from "vitest";
import { mockBalancesFor, mockBalanceOf } from "./use-mock-balances";

describe("mockBalancesFor", () => {
  it("同一地址派生结果恒定", () => {
    expect(mockBalancesFor("0xabc")).toEqual(mockBalancesFor("0xabc"));
  });

  it("不同地址派生不同余额；字段齐全且非负", () => {
    const a = mockBalancesFor("session-1");
    const b = mockBalancesFor("session-2");
    expect(a).not.toEqual(b);
    for (const bal of [a, b]) {
      expect(bal.usdt).toBeGreaterThanOrEqual(0);
      expect(bal.btc).toBeGreaterThanOrEqual(0);
      expect(bal.eth).toBeGreaterThanOrEqual(0);
      expect(bal.frozenUsdt).toBeGreaterThanOrEqual(0);
      expect(bal.frozenBtc).toBeGreaterThanOrEqual(0);
      expect(bal.frozenEth).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("mockBalanceOf", () => {
  const bal = { usdt: 100, btc: 2, eth: 3, frozenUsdt: 1, frozenBtc: 0.5, frozenEth: 0.25 };

  it("USDT/BTC/ETH 分别取对应字段", () => {
    expect(mockBalanceOf(bal, "USDT")).toBe(100);
    expect(mockBalanceOf(bal, "BTC")).toBe(2);
    expect(mockBalanceOf(bal, "ETH")).toBe(3);
  });

  it("未知资产返回 0", () => {
    expect(mockBalanceOf(bal, "SOL")).toBe(0);
  });
});
