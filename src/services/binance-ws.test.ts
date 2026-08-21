import { describe, expect, it } from "vitest";
import { backoffDelay } from "./binance-ws";

describe("backoffDelay", () => {
  it("落在指数增长区间内（±50% 抖动）", () => {
    for (let i = 0; i < 50; i++) {
      const d1 = backoffDelay(0);
      expect(d1).toBeGreaterThanOrEqual(500); // 1000 * 0.5
      expect(d1).toBeLessThan(1500); // 1000 * 1.5
      const d3 = backoffDelay(3);
      expect(d3).toBeGreaterThanOrEqual(4000); // 8000 * 0.5
      expect(d3).toBeLessThan(12000);
    }
  });

  it("封顶于 cap（含抖动上限）", () => {
    for (let i = 0; i < 20; i++) {
      expect(backoffDelay(30)).toBeLessThanOrEqual(45_000); // 30000 * 1.5
      expect(backoffDelay(30)).toBeGreaterThanOrEqual(15_000);
    }
  });

  it("负 attempt 视为 0", () => {
    expect(backoffDelay(-5)).toBeGreaterThanOrEqual(500);
    expect(backoffDelay(-5)).toBeLessThan(1500);
  });
});
