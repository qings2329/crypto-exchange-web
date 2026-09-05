import { describe, expect, it } from "vitest";
import { valueAssets } from "./wallet-utils";

describe("valueAssets", () => {
  const balances = [
    { asset: "USDT", available: 9_000, frozen: 1_000 },
    { asset: "BTC", available: 0.4, frozen: 0.1 },
    { asset: "ETH", available: 3.5, frozen: 0.5 },
  ];

  it("按价格折算 USD 并区分可用/冻结", () => {
    const { rows } = valueAssets(balances, { btcUsdt: 60_000, ethUsdt: 3_000 });
    const usdt = rows.find((r) => r.asset === "USDT")!;
    const btc = rows.find((r) => r.asset === "BTC")!;
    const eth = rows.find((r) => r.asset === "ETH")!;
    expect(usdt).toMatchObject({ available: 9_000, frozen: 1_000, usdValue: 10_000 });
    expect(btc).toMatchObject({ available: 0.4, frozen: 0.1, usdValue: 30_000 });
    expect(eth).toMatchObject({ available: 3.5, frozen: 0.5, usdValue: 12_000 });
  });

  it("总资产 = 各行 USD 之和；BTC 计价 = 总额 / BTC 价", () => {
    const { totalUsd, totalBtc } = valueAssets(balances, { btcUsdt: 50_000, ethUsdt: 2_500 });
    expect(totalUsd).toBeCloseTo(45_000, 6);
    expect(totalBtc).toBeCloseTo(0.9, 6);
  });

  it("BTC 价格为 0 时 totalBtc 不产生 Infinity", () => {
    const { totalBtc } = valueAssets(balances, { btcUsdt: 0, ethUsdt: 1 });
    expect(Number.isFinite(totalBtc)).toBe(true);
    expect(totalBtc).toBe(0);
  });

  it("withdraw_frozen 计入冻结与总额", () => {
    const { rows } = valueAssets(
      [{ asset: "USDT", available: 100, frozen: 0, withdraw_frozen: 50 }],
      { btcUsdt: 1, ethUsdt: 1 },
    );
    expect(rows[0]).toMatchObject({ available: 100, frozen: 50, total: 150, usdValue: 150 });
  });
});
