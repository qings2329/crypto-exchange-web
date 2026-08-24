// TradeHall 路由同步回归测试：
// - Perp 模式下切换交易对应跳 #/futures/:SYMBOL（曾因嗅探 hash 旧前缀跳回现货页）；
// - 切换模式时路由前缀随之改写（#/trade ↔ #/futures），URL 与所选模式保持一致。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "../i18n";
import { TradeHall } from "./TradeHall";

// 重依赖子组件全部替换为桩，聚焦路由行为
vi.mock("../services/binance", () => ({ fetchPremiumIndex: vi.fn().mockRejectedValue(new Error("skip")) }));
vi.mock("../hooks/use-ticker-live", () => ({ useTickerLive: vi.fn().mockReturnValue({ ticker: undefined, status: "live" }) }));
vi.mock("../hooks/use-media-query", () => ({ useMediaQuery: vi.fn().mockReturnValue(true) }));
vi.mock("../components/trade/TradingViewChart", () => ({ TradingViewChart: () => <div data-testid="chart" /> }));
vi.mock("../components/trade/OrderBook", () => ({ OrderBook: () => <div /> }));
vi.mock("../components/trade/RecentTrades", () => ({ RecentTrades: () => <div /> }));
vi.mock("../components/trade/OrderPanel", () => ({ OrderPanel: () => <div /> }));
vi.mock("../components/trade/OrdersPanel", () => ({ OrdersPanel: () => <div data-testid="orders-panel" /> }));
vi.mock("../components/trade/PositionsPanel", () => ({ PositionsPanel: () => <div /> }));
vi.mock("../components/trade/SymbolSelect", () => ({
  SymbolSelect: ({ onChange }: { onChange: (s: string) => void }) => (
    <button data-testid="symbol-select" onClick={() => onChange("ETHUSDT")}>
      pick ETHUSDT
    </button>
  ),
}));
vi.mock("../components/trade/StreamDot", () => ({ StreamDot: () => <div /> }));
vi.mock("../components/trade/MobileSwipeViews", () => ({ MobileSwipeViews: () => <div /> }));
vi.mock("../store/trade-draft-store", () => ({ useTradeDraft: vi.fn().mockReturnValue({}) }));

function renderHall(initialHash: string) {
  location.hash = initialHash;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <TradeHall symbol="BTCUSDT" initialMode={initialHash.includes("futures") ? "perp" : "spot"} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("TradeHall 路由同步", () => {
  beforeEach(() => {
    location.hash = "";
  });

  it("Perp 模式下切交易对：跳转 #/futures/:SYMBOL 而非回落 /trade（回归）", () => {
    renderHall("#/futures/BTCUSDT");
    fireEvent.click(screen.getByTestId("symbol-select"));
    expect(location.hash).toBe("#/futures/ETHUSDT");
  });

  it("Spot 模式下切模式到 Perp：hash 前缀同步改写为 /futures", () => {
    renderHall("#/trade/BTCUSDT");
    fireEvent.click(screen.getByTestId("mode-perp"));
    expect(location.hash).toBe("#/futures/BTCUSDT");
  });

  it("Perp 模式切回 Spot：hash 前缀同步改写为 /trade；同前缀不重复写 hash", () => {
    renderHall("#/futures/BTCUSDT");
    fireEvent.click(screen.getByTestId("mode-spot"));
    expect(location.hash).toBe("#/trade/BTCUSDT");
    // 已一致时不产生多余 history 记录
    const before = location.hash;
    fireEvent.click(screen.getByTestId("mode-spot"));
    expect(location.hash).toBe(before);
  });
});
