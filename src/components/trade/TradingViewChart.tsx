// K 线图表（TradingView Lightweight Charts v5）
// - REST 种子数据（TanStack Query 缓存）+ WS kline 流增量合并（series.update 零重绘）；
// - 周期切换：1m / 15m / 1h / 1d（Tab 下划线高亮，币安黄）；
// - 主题适配：MutationObserver 监听 data-theme，实时换肤；
// - 卸载时 chart.remove() + WS 取消订阅，杜绝泄漏。

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { fetchKlines } from "../../services/binance";
import { useKlineLive } from "../../hooks/use-kline-live";
import { fmtPrice } from "../../lib/format";
import { cn } from "../../lib/utils";
import { StreamDot } from "./StreamDot";
import type { Kline } from "../../types";

export const INTERVALS = ["1m", "15m", "1h", "1d"] as const;
export type ChartInterval = (typeof INTERVALS)[number];

interface Props {
  symbol: string;
  interval?: ChartInterval;
  onIntervalChange?: (i: ChartInterval) => void;
  limit?: number;
}

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (prop: string, fb: string) => css.getPropertyValue(prop).trim() || fb;
  return {
    background: v("--panel", "#1e2329"),
    textColor: v("--text-2", "#848e9c"),
    gridColor: v("--border", "#2b3139"),
    upColor: v("--buy", "#0ecb81"),
    downColor: v("--sell", "#f6465d"),
  };
}

export function TradingViewChart({ symbol, interval = "1m", onIntervalChange, limit = 300 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const seededRef = useRef(false);
  const candlesRef = useRef<Kline[]>([]);
  const [themeVer, setThemeVer] = useState(0);

  // REST 种子数据
  const { data, isLoading, isError } = useQuery({
    queryKey: ["binanceKlines", symbol, interval, limit],
    queryFn: () => fetchKlines(symbol, interval, limit),
    staleTime: 60_000,
  });

  // 种子落图
  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!candle || !vol || !data || data.length === 0) return;
    candlesRef.current = data;
    candle.setData(data.map(toCandle));
    vol.setData(data.map(toVolume));
    seededRef.current = true;
  }, [data]);

  // WS 实时增量：合并最后一根/追加新根，仅 update 当前 bar
  const wsStatus = useKlineLive(symbol, interval, (k) => {
    const list = candlesRef.current;
    if (list.length === 0) return; // 种子未到，REST 会带回最新一根
    const last = list[list.length - 1];
    if (k.time < last.time) return;
    const next = k.time === last.time ? [...list.slice(0, -1), k] : [...list, k];
    candlesRef.current = next;
    if (!seededRef.current) return;
    candleRef.current?.update(toCandle(k));
    volRef.current?.update(toVolume(k));
  });

  // 建图（一次）与销毁
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const theme = readTheme();
    const chart = createChart(el, {
      layout: { background: { color: theme.background }, textColor: theme.textColor },
      grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
      rightPriceScale: { borderColor: theme.gridColor },
      timeScale: { borderColor: theme.gridColor, timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderUpColor: theme.upColor,
      borderDownColor: theme.downColor,
      wickUpColor: theme.upColor,
      wickDownColor: theme.downColor,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    candleRef.current = candle;

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      seededRef.current = false;
      candlesRef.current = [];
    };
  }, []);

  // 换周期后重置种子标记（新 setData 由上面的 effect 完成）
  useEffect(() => {
    seededRef.current = false;
    candlesRef.current = [];
  }, [symbol, interval]);

  // 主题跟随
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeVer((v) => v + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    void themeVer;
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    const theme = readTheme();
    chart.applyOptions({
      layout: { background: { color: theme.background }, textColor: theme.textColor },
      grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
      rightPriceScale: { borderColor: theme.gridColor },
      timeScale: { borderColor: theme.gridColor },
    });
    candle.applyOptions({
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderUpColor: theme.upColor,
      borderDownColor: theme.downColor,
      wickUpColor: theme.upColor,
      wickDownColor: theme.downColor,
    });
  }, [themeVer]);

  const lastClose = candlesRef.current.at(-1)?.close;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* 周期 Tab：下划线式，激活币安黄加粗 */}
      <div className="flex items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((i) => {
            const active = i === interval;
            return (
              <button
                key={i}
                onClick={() => onIntervalChange?.(i)}
                className={cn(
                  "relative cursor-pointer px-3 py-2.5 text-xs transition-colors",
                  active ? "font-bold text-accent" : "text-muted hover:text-foreground"
                )}
              >
                {i.toUpperCase()}
                {active && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {lastClose !== undefined && (
            <span className="text-xs tabular-nums text-muted">
              Close <span className="font-semibold text-foreground">{fmtPrice(lastClose)}</span>
            </span>
          )}
          <StreamDot status={wsStatus} />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={wrapRef} className="absolute inset-0" />
        {(isLoading || isError) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted">
            {isLoading ? "Loading klines..." : "Failed to load klines (network/region restricted)"}
          </div>
        )}
      </div>
    </div>
  );
}

function toCandle(k: Kline): CandlestickData<Time> {
  return { time: (k.time / 1000) as Time, open: k.open, high: k.high, low: k.low, close: k.close };
}

function toVolume(k: Kline): HistogramData<Time> {
  return {
    time: (k.time / 1000) as Time,
    value: k.volume,
    color: k.close >= k.open ? "rgba(14,203,129,0.45)" : "rgba(246,70,93,0.45)",
  };
}
