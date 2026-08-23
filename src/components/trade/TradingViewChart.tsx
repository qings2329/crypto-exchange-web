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
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, connectKlineWS, type Kline } from "../../api/client";
import type { BinanceWsStatus } from "../../services/binance-ws";
import { fmtPrice } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { StreamDot } from "./StreamDot";
import { InlineError } from "../InlineError";

export const INTERVALS = ["1m", "15m", "1h", "1d"] as const;
export type ChartInterval = (typeof INTERVALS)[number];

// 均线参数：币安默认 MA(7) / MA(25)，叠加在 K 线主图。
const MA_CONFIG: { period: number; color: string }[] = [
  { period: 7, color: "#F0B90B" },
  { period: 25, color: "#E066FF" },
];

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

/** 由收盘价序列计算移动平均线数据点。 */
function maPoints(klines: Kline[], period: number): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i].c;
    if (i >= period) sum -= klines[i - period].c;
    if (i >= period - 1) out.push({ time: (klines[i].t / 1000) as Time, value: sum / period });
  }
  return out;
}

export function TradingViewChart({ symbol, interval = "1m", onIntervalChange, limit = 300 }: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maRefs = useRef<(ISeriesApi<"Line"> | null)[]>([]);
  const seededRef = useRef(false);
  const candlesRef = useRef<Kline[]>([]);
  const [themeVer, setThemeVer] = useState(0);
  const [showMA, setShowMA] = useState(true);

  // REST 种子数据：走自建后端 /api/v1/market/kline（经 Vite 代理），
  // 而非直连 api.binance.com，规避受限网络下的地域封锁。
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["klines", symbol, interval, limit],
    queryFn: () => api.getKline(symbol, interval, limit),
    staleTime: 60_000,
  });

  // 重新计算并落 MA 线（每次种子更新或开关切换时调用）。
  const paintMA = () => {
    const list = candlesRef.current;
    MA_CONFIG.forEach((cfg, idx) => {
      const s = maRefs.current[idx];
      if (!s) return;
      s.setData(showMA && list.length ? maPoints(list, cfg.period) : []);
    });
  };

  // 种子落图
  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!candle || !vol || !data || data.length === 0) return;
    candlesRef.current = data;
    candle.setData(data.map(toCandle));
    vol.setData(data.map(toVolume));
    seededRef.current = true;
    paintMA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showMA]);

  // WS 实时增量：走自建后端 /api/v1/market/kline/ws（与 KLineChart 一致），
  // 合并最后一根/追加新根，仅 update 当前 bar；连接状态驱动顶栏指示灯。
  const [wsStatus, setWsStatus] = useState<BinanceWsStatus>("idle");
  useEffect(() => {
    setWsStatus("connecting");
    const stop = connectKlineWS(
      symbol,
      interval,
      (k) => {
        const list = candlesRef.current;
        if (list.length === 0) return; // 种子未到，REST 会带回最新一根
        const last = list[list.length - 1];
        if (k.t < last.t) return;
        const next = k.t === last.t ? [...list.slice(0, -1), k] : [...list, k];
        candlesRef.current = next;
        if (!seededRef.current) return;
        candleRef.current?.update(toCandle(k));
        volRef.current?.update(toVolume(k));
        if (showMA) {
          MA_CONFIG.forEach((cfg, idx) => {
            const pt = maPoints(next, cfg.period).at(-1);
            if (pt) maRefs.current[idx]?.update(pt);
          });
        }
      },
      () => setWsStatus("closed"),
    );
    setWsStatus("open");
    return () => {
      stop();
      setWsStatus("closed");
    };
  }, [symbol, interval, showMA]);

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

    // 均线叠加层（固定在主价格刻度，不占额外空间）
    maRefs.current = MA_CONFIG.map((cfg) =>
      chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    // 若种子数据已就绪（极少见：查询早于建图完成），补绘一次 MA。
    if (seededRef.current) paintMA();

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      maRefs.current = [];
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

  const lastClose = candlesRef.current.at(-1)?.c;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* 周期 Tab + 指标开关：下划线式，激活币安黄加粗 */}
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
          {/* 均线 MA 开关 */}
          <button
            type="button"
            onClick={() => setShowMA((v) => !v)}
            aria-pressed={showMA}
            title={t("trade.ma")}
            className={cn(
              "flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
              showMA
                ? "border-accent/60 text-accent"
                : "border-border text-muted hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-0.5">
              {MA_CONFIG.map((cfg) => (
                <span key={cfg.period} className="size-2 rounded-full" style={{ background: cfg.color }} />
              ))}
            </span>
            {t("trade.ma")}
            <span className="text-[10px] opacity-70">{showMA ? t("trade.maOn") : t("trade.maOff")}</span>
          </button>
          {lastClose !== undefined && (
            <span className="hidden text-xs tabular-nums text-muted sm:inline">
              Close <span className="font-semibold text-foreground">{fmtPrice(lastClose)}</span>
            </span>
          )}
          <StreamDot status={wsStatus} />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={wrapRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex flex-col gap-3 p-4" aria-hidden data-testid="chart-skeleton">
            <div className="flex flex-1 items-end gap-2">
              {[38, 62, 45, 80, 55, 70, 48, 88, 60, 74, 52, 66, 42, 78, 58].map((h, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
              ))}
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
        )}
        {isError && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-sell">
            <InlineError err={error} failKey="trade.klineErr" />
          </div>
        )}
      </div>
    </div>
  );
}

function toCandle(k: Kline): CandlestickData<Time> {
  return { time: (k.t / 1000) as Time, open: k.o, high: k.h, low: k.l, close: k.c };
}

function toVolume(k: Kline): HistogramData<Time> {
  return {
    time: (k.t / 1000) as Time,
    value: k.v,
    color: k.c >= k.o ? "rgba(14,203,129,0.45)" : "rgba(246,70,93,0.45)",
  };
}
