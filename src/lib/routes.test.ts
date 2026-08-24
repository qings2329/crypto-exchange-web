// routes 纯函数测试：交易大厅路由生成（模式 ↔ 前缀映射）。

import { describe, expect, it } from "vitest";
import { hallRoute } from "./routes";

describe("hallRoute", () => {
  it("spot → #/trade/:SYMBOL，perp → #/futures/:SYMBOL", () => {
    expect(hallRoute("spot", "BTCUSDT")).toBe("#/trade/BTCUSDT");
    expect(hallRoute("perp", "BTCUSDT")).toBe("#/futures/BTCUSDT");
  });

  it("交易对统一大写（App 路由按大写归一化匹配）", () => {
    expect(hallRoute("perp", "ethusdt")).toBe("#/futures/ETHUSDT");
  });
});
