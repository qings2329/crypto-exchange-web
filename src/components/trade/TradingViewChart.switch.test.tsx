import { render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/i18next";
import "../../i18n/index";

const h = vi.hoisted(() => {
  // 第一个 addSeries 返回 candle 系列，其 setData 用于断言重新落图
  const series: Array<{ setData: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; applyOptions: ReturnType<typeof vi.fn>; priceScale: () => { applyOptions: () => void } }> = [];
  const getKline = vi.fn();
  return { series, getKline };
});

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => {
      const s = {
        applyOptions: vi.fn(),
        setData: vi.fn(),
        update: vi.fn(),
        priceScale: () => ({ applyOptions: vi.fn() }),
      };
      h.series.push(s);
      return s;
    }),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  CandlestickSeries: class {},
  HistogramSeries: class {},
  LineSeries: class {},
}));

vi.mock("../../api/client", () => ({
  api: { getKline: h.getKline },
  connectKlineWS: vi.fn(() => () => {}),
}));

import { TradingViewChart } from "./TradingViewChart";

function klineFor(close: number) {
  const t = Math.floor(Date.now() / 60000) * 60000;
  return [
    { t, o: close - 1, h: close + 1, l: close - 2, c: close, v: 1 },
    { t: t + 60000, o: close, h: close + 1, l: close - 1, c: close, v: 1 },
  ];
}

describe("TradingViewChart 切换交易对", () => {
  it("切换 symbol 后以新交易对数据重新落图", async () => {
    h.getKline.mockImplementation((symbol: string) =>
      Promise.resolve(symbol === "BTCUSDT" ? klineFor(100) : klineFor(5000)),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (symbol: string) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <TradingViewChart symbol={symbol} interval="1m" />
        </I18nextProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(tree("BTCUSDT"));

    await waitFor(() => expect(h.series[0].setData).toHaveBeenCalled());
    expect((h.series[0].setData.mock.calls[0][0] as Array<{ close: number }>)[0].close).toBe(100);

    rerender(tree("ETHUSDT"));

    await waitFor(() => expect(h.getKline).toHaveBeenCalledWith("ETHUSDT", "1m", 300));
    await waitFor(() => {
      const calls = h.series[0].setData.mock.calls;
      const last = calls[calls.length - 1][0] as Array<{ close: number }>;
      expect(last[0].close).toBe(5000);
    });
  });
});
