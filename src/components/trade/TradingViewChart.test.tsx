import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/i18next";
import "../../i18n/index";

// lightweight-charts 依赖 canvas，jsdom 不支持，需整体 mock。
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({
      applyOptions: vi.fn(),
      setData: vi.fn(),
      update: vi.fn(),
      priceScale: () => ({ applyOptions: vi.fn() }),
    })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  CandlestickSeries: class {},
  HistogramSeries: class {},
  LineSeries: class {},
}));

// REST 种子数据走真实 Binance（../../services/binance），mock 使其 reject，
// 触发 useQuery 的 isError 分支，覆盖层渲染 InlineError（trade.klineErr）。
vi.mock("../../services/binance", () => ({
  fetchKlines: vi.fn().mockRejectedValue(new Error("network down")),
  klineStream: vi.fn(() => ""),
  parseKlineEvent: vi.fn(),
}));

// 实时流：测试中无需建立真实 Binance WS 连接，仅返回连接状态。
vi.mock("../../hooks/use-kline-live", () => ({
  useKlineLive: vi.fn(() => "connecting"),
}));

import { TradingViewChart } from "./TradingViewChart";

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        {ui}
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TradingViewChart 错误态快照", () => {
  it("K 线加载失败 → 覆盖层渲染 InlineError（trade.klineErr）", async () => {
    const { asFragment } = renderWithProviders(
      <TradingViewChart symbol="BTCUSDT" interval="1m" />,
    );
    expect(await screen.findByText(/加载 K 线失败/)).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });
});
