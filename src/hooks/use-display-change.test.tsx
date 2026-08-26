// useDisplayChange 单元测试：验证 24h 原生、custom 基准按 K 线开盘计算，
// 以及 K 线拉取失败 / 数据未就绪时降级到交易所原生 24h 涨跌幅（避免显示「--」）。

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDisplayChange } from "./use-display-change";
import { fetchKlines } from "../services/binance";
import type { Ticker } from "../types";

vi.mock("../services/binance", () => ({
  fetchKlines: vi.fn(),
}));

const mockFetchKlines = fetchKlines as unknown as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const ticker = (pct: number): Ticker => ({
  symbol: "BTCUSDT",
  lastPrice: 100,
  openPrice: 100,
  highPrice: 100,
  lowPrice: 100,
  volume: 0,
  quoteVolume: 0,
  priceChange: 0,
  priceChangePercent: pct,
});

describe("useDisplayChange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("24h 基准直接采用 ticker 原生涨跌幅", () => {
    const { result } = renderHook(
      () => useDisplayChange("BTCUSDT", "24h", 100, ticker(2.5)),
      { wrapper: makeWrapper() }
    );
    expect(result.current.percent).toBe(2.5);
  });

  it("custom 基准：kline 成功则按开盘价计算涨跌幅", async () => {
    mockFetchKlines.mockResolvedValue([{ open: 100 }, { open: 110 }]);
    const { result } = renderHook(
      () => useDisplayChange("BTCUSDT", "1h", 105, null),
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(result.current.percent).toBeCloseTo(((105 - 110) / 110) * 100, 5)
    );
  });

  it("custom 基准：kline 拉取失败降级到 ticker 24h 涨跌幅", async () => {
    mockFetchKlines.mockRejectedValue(new Error("network"));
    const { result } = renderHook(
      () => useDisplayChange("BTCUSDT", "today", 105, ticker(-3.2)),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.percent).toBe(-3.2));
  });

  it("custom 基准：kline 失败且 ticker 缺失时回退 NaN（展示 --）", async () => {
    mockFetchKlines.mockRejectedValue(new Error("network"));
    const { result } = renderHook(
      () => useDisplayChange("BTCUSDT", "1h", 105, null),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(Number.isNaN(result.current.percent)).toBe(true));
  });

  it("custom 基准：最新价缺失（数据未就绪）时同样降级到 ticker", async () => {
    mockFetchKlines.mockResolvedValue([{ open: 100 }, { open: 110 }]);
    const { result } = renderHook(
      () => useDisplayChange("BTCUSDT", "today", undefined, ticker(1.1)),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.percent).toBe(1.1));
  });
});
