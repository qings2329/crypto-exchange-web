import { describe, expect, it } from "vitest";
import { dailyIncome, estIncome, fmtAPY, fmtDuration, projectStatus } from "./earn-utils";

describe("earn-utils", () => {
  it("dailyIncome：金额 × APY / 365", () => {
    expect(dailyIncome(36500, 0.1)).toBeCloseTo(10, 6);
    expect(dailyIncome(1000, 0.065)).toBeCloseTo(0.1780821918, 6);
    expect(dailyIncome(0, 0.1)).toBe(0);
    expect(dailyIncome(100, 0)).toBe(0);
    expect(dailyIncome(-5, 0.1)).toBe(0);
  });

  it("estIncome：区间收益", () => {
    expect(estIncome(36500, 0.1, 30)).toBeCloseTo(300, 4);
    expect(estIncome(100, 0.1, 0)).toBe(0);
  });

  it("fmtAPY：百分比两位小数", () => {
    expect(fmtAPY(0.065)).toBe("6.50%");
    expect(fmtAPY(0.158)).toBe("15.80%");
  });

  it("projectStatus：时间窗推导", () => {
    const now = Date.now();
    expect(projectStatus(new Date(now + 1000).toISOString(), new Date(now + 9999e3).toISOString(), now)).toBe("upcoming");
    expect(projectStatus(new Date(now - 1000).toISOString(), new Date(now + 9999e3).toISOString(), now)).toBe("ongoing");
    expect(projectStatus(new Date(now - 9999e3).toISOString(), new Date(now - 1000).toISOString(), now)).toBe("ended");
  });

  it("fmtDuration：dd:hh:mm:ss 与 hh:mm:ss", () => {
    expect(fmtDuration(3 * 3600 * 1000 + 120_000 + 5000)).toBe("03:02:05");
    expect(fmtDuration(2 * 86400e3 + 3661_000)).toBe("2d 01:01:01");
    expect(fmtDuration(-1)).toBe("00:00:00");
  });
});
