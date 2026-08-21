// 语言包一致性：四语言 key 集合必须完全一致，值非空；核心 key 必须存在。
import { describe, expect, it } from "vitest";
import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";
import zhTW from "./zh-TW.json";
import jaJP from "./ja-JP.json";

const PACKS: Record<string, Record<string, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
};

const CORE_KEYS = [
  "nav.home",
  "nav.trade",
  "nav.futures",
  "nav.markets",
  "nav.wallet",
  "header.login",
  "tab.home",
  "tab.markets",
  "tab.trade",
  "tab.wallet",
  "orderPanel.buy",
  "orderPanel.sell",
  "orderPanel.limit",
  "orderPanel.market",
  "orderStatus.open",
  "orderStatus.filled",
  "orderStatus.canceled",
];

describe("i18n locales", () => {
  it("四语言 key 集合完全一致", () => {
    const base = Object.keys(PACKS["zh-CN"]).sort();
    for (const [loc, pack] of Object.entries(PACKS)) {
      expect(Object.keys(pack).sort(), `${loc} key 集合不一致`).toEqual(base);
    }
  });

  it("所有值非空字符串", () => {
    for (const [loc, pack] of Object.entries(PACKS)) {
      for (const [k, v] of Object.entries(pack)) {
        expect(typeof v, `${loc}.${v && k} 类型`).toBe("string");
        expect(v.length, `${loc}.${k} 为空`).toBeGreaterThan(0);
      }
    }
  });

  it("核心 key 存在且插值占位符各语言一致", () => {
    const varsOf = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
    for (const key of CORE_KEYS) {
      const ref = varsOf(PACKS["zh-CN"][key]);
      for (const [loc, pack] of Object.entries(PACKS)) {
        expect(varsOf(pack[key]), `${loc}.${key} 插值不一致`).toBe(ref);
      }
    }
    // 带参数的 key 单独校验
    for (const key of ["orderPanel.minSize", "ordersPanel.openOrders", "orderPanel.insufficientUsdt"]) {
      const ref = varsOf(PACKS["zh-CN"][key]);
      for (const [loc, pack] of Object.entries(PACKS)) {
        expect(varsOf(pack[key]), `${loc}.${key} 插值不一致`).toBe(ref);
      }
    }
  });
});
