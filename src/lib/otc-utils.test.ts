import { describe, expect, it } from "vitest";
import { fmtCountdown, msLeftFrom, qtyFromTotal, totalFromQty } from "./otc-utils";

describe("otc-utils", () => {
  it("fmtCountdown：mm:ss 与过期钳零", () => {
    expect(fmtCountdown(14 * 60 * 1000 + 32_000)).toBe("14:32");
    expect(fmtCountdown(5_000)).toBe("00:05");
    expect(fmtCountdown(-1000)).toBe("00:00"); // 过期钳零
  });

  it("msLeftFrom：基于服务端 expire_at 计算剩余时间", () => {
    const now = 1_000_000;
    expect(msLeftFrom(new Date(now + 65_000).toISOString(), now)).toBe(65_000);
    expect(msLeftFrom(undefined, now)).toBe(0);
    expect(msLeftFrom(new Date(now - 1).toISOString(), now)).toBeLessThan(0);
  });

  it("金额↔数量互算（qty 两位小数）", () => {
    expect(qtyFromTotal(71600, 7.16)).toBe(10000);
    expect(qtyFromTotal(100, 7.16)).toBe(13.96); // 向下取整
    expect(totalFromQty(2.5, 7.16)).toBe(17.89); // 浮点向下取整
    expect(qtyFromTotal(0, 7.16)).toBe(0);
    expect(totalFromQty(1, 0)).toBe(0);
  });
});
