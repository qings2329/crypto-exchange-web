import { describe, expect, it } from "vitest";
import { withinRange } from "./order-filters";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("withinRange", () => {
  it("7d：仅保留最近 7 天", () => {
    expect(withinRange(NOW - 6 * DAY, { kind: "7d" }, NOW)).toBe(true);
    expect(withinRange(NOW - 8 * DAY, { kind: "7d" }, NOW)).toBe(false);
    expect(withinRange(NOW, { kind: "7d" }, NOW)).toBe(true);
  });

  it("30d：边界值判定", () => {
    expect(withinRange(NOW - 30 * DAY, { kind: "30d" }, NOW)).toBe(true);
    expect(withinRange(NOW - 31 * DAY, { kind: "30d" }, NOW)).toBe(false);
  });

  it("all：全部通过", () => {
    expect(withinRange(0, { kind: "all" }, NOW)).toBe(true);
  });

  it("custom：闭区间", () => {
    const r = { kind: "custom" as const, from: NOW - 2 * DAY, to: NOW - DAY };
    expect(withinRange(NOW - 2 * DAY, r, NOW)).toBe(true);
    expect(withinRange(NOW - DAY, r, NOW)).toBe(true);
    expect(withinRange(NOW - 3 * DAY, r, NOW)).toBe(false);
    expect(withinRange(NOW, r, NOW)).toBe(false);
  });
});
