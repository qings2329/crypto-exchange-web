import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from "lightweight-charts";
import { api, connectKlineWS, type Kline } from "../api/client";
import { reportWsDrop } from "../lib/monitor";
import { useI18n } from "../i18n";
import { InlineError } from "./InlineError";

interface Props {
  symbol: string;
  interval?: string;
  limit?: number;
}

function klineToCandlestick(k: Kline): CandlestickData<Time> {
  return { time: (k.t / 1000) as Time, open: k.o, high: k.h, low: k.l, close: k.c };
}

function klineToVolume(k: Kline): HistogramData<Time> {
  return {
    time: (k.t / 1000) as Time,
    value: k.v,
    color: k.c >= k.o ? "rgba(14,203,129,0.45)" : "rgba(246,70,93,0.45)",
  };
}

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (prop: string, fb: string) => css.getPropertyValue(prop).trim() || fb;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  return {
    background: v("--panel", isLight ? "#fff" : "#1e2329"),
    textColor: v("--text-2", isLight ? "#707a8a" : "#848e9c"),
    gridColor: v("--border", isLight ? "#e6e6e6" : "#2b3139"),
    upColor: v("--buy", "#0ecb81"),
    downColor: v("--sell", "#f6465d"),
    crosshairLineColor: v("--muted", isLight ? "#707a8a" : "#848e9c"),
  };
}

export function KLineChart({ symbol, interval = "1m", limit = 500 }: Props) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const dataRef = useRef<Kline[]>([]);

  const [data, setData] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [live, setLive] = useState(false);
  const [themeVer, setThemeVer] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getKline(symbol, interval, limit)
      .then((rows) => {
        if (!alive) return;
        const list = Array.isArray(rows) ? rows : [];
        dataRef.current = list;
        setData(list);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [symbol, interval, limit]);

  useEffect(() => {
    const wasLive = { current: false };
    const stop = connectKlineWS(
      symbol,
      interval,
      (k) => {
        setLive(true);
        wasLive.current = true;
        const list = dataRef.current;
        if (list.length === 0) {
          const next = [k];
          dataRef.current = next;
          setData(next);
          return;
        }
        const last = list[list.length - 1];
        let updated: Kline[];
        if (k.t === last.t) {
          updated = list.slice(0, -1).concat(k);
        } else if (k.t > last.t) {
          updated = list.concat(k);
          if (updated.length > limit) updated = updated.slice(updated.length - limit);
        } else {
          return;
        }
        dataRef.current = updated;
        setData(updated);
      },
      () => {
        setLive(false);
        if (wasLive.current) {
          wasLive.current = false;
          reportWsDrop(symbol);
        }
      }
    );
    return () => { setLive(false); stop(); };
  }, [symbol, interval, limit]);

  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setThemeVer((v) => v + 1));
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const theme = readTheme();
    const chart = createChart(el, {
      layout: { background: { color: theme.background }, textColor: theme.textColor },
      grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
      crosshair: { vertLine: { color: theme.crosshairLineColor, labelBackgroundColor: theme.background }, horzLine: { color: theme.crosshairLineColor, labelBackgroundColor: theme.background } },
      rightPriceScale: { borderColor: theme.gridColor },
      timeScale: { borderColor: theme.gridColor, timeVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderUpColor: theme.upColor,
      borderDownColor: theme.downColor,
      wickUpColor: theme.upColor,
      wickDownColor: theme.downColor,
    });
    candleRef.current = candleSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = volSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!chart || !candle || !vol) return;

    const theme = readTheme();
    chart.applyOptions({
      layout: { background: { color: theme.background }, textColor: theme.textColor },
      grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
      crosshair: { vertLine: { color: theme.crosshairLineColor, labelBackgroundColor: theme.background }, horzLine: { color: theme.crosshairLineColor, labelBackgroundColor: theme.background } },
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

  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!candle || !vol) return;
    if (data.length === 0) return;

    const candleData: CandlestickData<Time>[] = data.map(klineToCandlestick);
    const volData: HistogramData<Time>[] = data.map(klineToVolume);
    candle.setData(candleData);
    vol.setData(volData);
  }, [data]);

  return (
    <div className="kchart">
      <div className="kchart-head">
        <span className="kchart-title">{symbol} · {interval}</span>
        <span className={live ? "dot live" : "dot"} title={live ? t("trade.live") : t("trade.offline")} />
      </div>
      <div className="kchart-canvas-wrap" ref={wrapRef}>
        {loading && <div className="kchart-tip">{t("common.loading")}</div>}
        {!loading && error != null && (
          <div className="kchart-tip err">
            <InlineError err={error} failKey="trade.klineErr" />
          </div>
        )}
        {!loading && !error && data.length === 0 && (
          <div className="kchart-tip">{t("trade.noKline")}</div>
        )}
      </div>
    </div>
  );
}
