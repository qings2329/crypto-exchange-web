import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18next";
import { I18nProvider } from "../i18n";

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
}));

// KLineChart 同时用到 api.getKline（REST 种子）与 connectKlineWS（实时流），
// 二者均来自 ../api/client；失败态只需让 getKline reject，并把 connectKlineWS 置为无副作用订阅。
vi.mock("../api/client", () => ({
  api: {
    getKline: vi.fn().mockRejectedValue(new Error("network down")),
  },
  connectKlineWS: vi.fn(() => () => {}),
}));

import { KLineChart } from "./KLineChart";

describe("KLineChart 错误态快照", () => {
  it("K 线加载失败 → 渲染 InlineError（trade.klineErr）", async () => {
    const { asFragment } = render(
      <I18nProvider>
        <I18nextProvider i18n={i18n}>
          <KLineChart symbol="BTC_USDT" interval="1m" />
        </I18nextProvider>
      </I18nProvider>,
    );
    // 错误态文案由 InlineError + trade.klineErr 插值生成，等待异步 reject 后渲染。
    expect(await screen.findByText(/加载 K 线失败/)).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });
});
