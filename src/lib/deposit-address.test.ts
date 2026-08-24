// 充值地址派生：确定性、格式合规（演示用途，见 deposit-address.ts 头注释）。
import { describe, expect, it } from "vitest";
import { demoDepositAddress } from "./deposit-address";

describe("demoDepositAddress", () => {
  it("同一输入恒定输出", () => {
    const a = demoDepositAddress(7, "USDT", "ERC20");
    const b = demoDepositAddress(7, "USDT", "ERC20");
    expect(a).toBe(b);
  });

  it("uid / asset / network 任一不同则地址不同", () => {
    const base = demoDepositAddress(1, "ETH");
    expect(demoDepositAddress(2, "ETH")).not.toBe(base);
    expect(demoDepositAddress(1, "BTC")).not.toBe(base);
    expect(demoDepositAddress(1, "USDT", "TRC20")).not.toBe(
      demoDepositAddress(1, "USDT", "ERC20")
    );
  });

  it("格式合规：BTC bech32 前缀与长度", () => {
    const addr = demoDepositAddress(1, "BTC");
    expect(addr.startsWith("bc1q")).toBe(true);
    expect(addr).toHaveLength(42);
  });

  it("格式合规：EVM 0x + 40 位十六进制", () => {
    for (const [asset, network] of [
      ["ETH", ""],
      ["USDT", "ERC20"],
      ["SOL", ""],
    ] as const) {
      const addr = demoDepositAddress(3, asset, network || undefined);
      expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("格式合规：TRON T + 33 位 Base58", () => {
    expect(demoDepositAddress(4, "TRX")).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(demoDepositAddress(4, "USDT", "trc20")).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("未登录（uid 空）也可生成稳定地址", () => {
    expect(demoDepositAddress(undefined, "ETH")).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
