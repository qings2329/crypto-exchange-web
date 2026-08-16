import { useEffect, useRef, useState } from "react";
import { api, connectMarketWS, type Kline } from "../api/client";
import { reportWsDrop } from "../lib/monitor";

interface Props {
  symbol: string;
  interval?: string;
  limit?: number;
}

const UP = "#16c784";
const DOWN = "#ea3943";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#8b95a5";
const PAD = { top: 10, right: 64, bottom: 22, left: 8 };

// 零依赖的 Canvas K 线组件：拉取历史 K 线后自绘蜡烛图，
// 并通过行情 WS 将最新价实时回填到最后一根蜡烛，实现轻量实时更新。
export function KLineChart({ symbol, interval = "1m", limit = 500 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<Kline[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [data, setData] = useState<Kline[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // 加载历史 K 线
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
        setError(e instanceof Error ? e.message : "加载 K 线失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [symbol, interval, limit]);

  // 容器尺寸自适应
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      sizeRef.current = { w: Math.floor(r.width), h: Math.floor(r.height) };
      setSize(sizeRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 实时最新价回填最后一根蜡烛
  useEffect(() => {
    const wasLive = { current: false };
    const stop = connectMarketWS(
      symbol,
      (t) => {
        setLive(true);
        wasLive.current = true;
        const list = dataRef.current;
        if (list.length === 0) return;
        const last = list[list.length - 1];
        const price = t.last;
        const next: Kline = {
          ...last,
          c: price,
          h: Math.max(last.h, price),
          l: Math.min(last.l, price),
        };
        const updated = list.slice(0, -1).concat(next);
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
    return () => {
      setLive(false);
      stop();
    };
  }, [symbol]);

  // 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const list = data;
    if (list.length === 0) return;

    const plotW = size.w - PAD.left - PAD.right;
    const plotH = size.h - PAD.top - PAD.bottom;
    const volH = Math.round(plotH * 0.18);
    const priceH = plotH - volH - 6;

    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;
    for (const k of list) {
      if (k.l < min) min = k.l;
      if (k.h > max) max = k.h;
      if (k.v > maxVol) maxVol = k.v;
    }
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = min - 1;
      max = max + 1;
    }
    const padR = (max - min) * 0.05;
    min -= padR;
    max += padR;

    const n = list.length;
    const step = plotW / n;
    const cw = Math.max(1, Math.min(step * 0.7, 18));
    const yOf = (p: number) => PAD.top + ((max - p) / (max - min)) * priceH;
    const xOf = (i: number) => PAD.left + step * (i + 0.5);

    // 网格 + 价格刻度（右侧）
    ctx.font = "11px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = AXIS;
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const p = min + ((max - min) * i) / ticks;
      const y = yOf(p);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(2), PAD.left + plotW + 6, y);
    }

    // 蜡烛 + 成交量
    for (let i = 0; i < n; i++) {
      const k = list[i];
      const x = xOf(i);
      const up = k.c >= k.o;
      const color = up ? UP : DOWN;
      const yo = yOf(k.o);
      const yc = yOf(k.c);
      const yh = yOf(k.h);
      const yl = yOf(k.l);

      // 影线
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yh);
      ctx.lineTo(x, yl);
      ctx.stroke();

      // 实体
      const top = Math.min(yo, yc);
      const bh = Math.max(1, Math.abs(yc - yo));
      ctx.fillStyle = color;
      ctx.fillRect(x - cw / 2, top, cw, bh);

      // 成交量
      if (maxVol > 0) {
        const vh = (k.v / maxVol) * volH;
        const vy = size.h - PAD.bottom - vh;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x - cw / 2, vy, cw, vh);
        ctx.globalAlpha = 1;
      }
    }
  }, [data, size]);

  return (
    <div className="kchart">
      <div className="kchart-head">
        <span className="kchart-title">{symbol} · {interval}</span>
        <span className={live ? "dot live" : "dot"} title={live ? "实时" : "离线"} />
      </div>
      <div className="kchart-canvas-wrap" ref={wrapRef}>
        {loading && <div className="kchart-tip">加载中…</div>}
        {!loading && error && <div className="kchart-tip err">{error}</div>}
        {!loading && !error && data.length === 0 && (
          <div className="kchart-tip">暂无 K 线数据</div>
        )}
        <canvas ref={canvasRef} className="kchart-canvas" />
      </div>
    </div>
  );
}
