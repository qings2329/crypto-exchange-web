// 未结平仓头寸面板：合约对/杠杆/开仓均价/标记价格/强平价/未实现盈亏（着色）/保证金率。
// 提供 Market Close（确认弹窗）与 TP/SL 设置弹窗；按逐仓/全仓分别计算强平价与保证金率。
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFuturesStore, crossPoolOf, type Position } from "../../store/futures-store";
import { api, ApiError } from "../../api/client";
import { useMarkPrices, useTickerLive } from "../../hooks/use-ticker-live";
import { calcPnl, calcPositionRisk, parseMarginMode, parsePosSide, type PositionRisk } from "../../lib/futures-math";
import { fmtPrice, fmtQty } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { Modal } from "../Modal";
import { useConfirm } from "../Confirm";
import { useToast } from "../Toast";

/**
 * 服务端持仓（Go 导出字段）→ 本地镜像结构；id 用 symbol+side+openTime 稳定映射。
 * Go 的 Position 无 json tag，Side/Mode 序列化为数字枚举，用 parse* 归一化。
 */
function toLocal(p: {
  UserID: number;
  Symbol: string;
  Side: number | string;
  Size: number;
  EntryPrice: number;
  Margin: number;
  Leverage: number;
  Mode: number | string;
  OpenTime: number;
}): Position {
  return {
    id: `${p.Symbol}-${p.Side}-${p.OpenTime}`,
    userId: p.UserID,
    symbol: p.Symbol,
    side: parsePosSide(p.Side),
    leverage: p.Leverage,
    marginMode: parseMarginMode(p.Mode),
    entryPrice: p.EntryPrice,
    qty: p.Size,
    margin: p.Margin,
    ts: p.OpenTime,
  };
}

export function PositionsPanel({ symbol }: { symbol: string }) {
  const { t } = useTranslation();
  const { uid } = useAuth();
  const positions = useFuturesStore((s) => s.positions);
  const hydrate = useFuturesStore((s) => s.hydrate);
  const setCrossBalances = useFuturesStore((s) => s.setCrossBalances);
  // 共享池是 (user, symbol) 粒度，本轮只查过 symbol，故该值只对同 symbol 的仓位有效
  const crossPool = useFuturesStore((s) => crossPoolOf(s, uid));

  // 后端 /futures/positions 未按 token 过滤，返回所有用户持仓：只渲染本人的
  const own = positions.filter((p) => String(p.userId) === String(uid));
  const mine = own.filter((p) => p.symbol === symbol);
  const others = own.filter((p) => p.symbol !== symbol);
  const rows = [...mine, ...others];

  // 服务端为真相源：挂载即拉取，之后每 5s 轮询对账（本地乐观更新仅作即时反馈）
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const d = await api.futuresPositions(symbol);
        if (!alive) return;
        setCrossBalances(d.cross_balances ?? {});
        hydrate(
          symbol,
          (d.positions ?? []).map(toLocal)
        );
      } catch {
        /* 未登录/网络失败时保留本地镜像 */
      }
    };
    void pull();
    const t = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol, hydrate, setCrossBalances]);

  // 标记价：当前交易对走 WS 实时流，其余交易对走批量轮询（仅供全仓共享池聚合，精度要求低）
  const { ticker } = useTickerLive(symbol);
  const livePrice = ticker?.lastPrice;
  const markPrices = useMarkPrices(rows.map((p) => p.symbol));
  const markOf = (p: Position) =>
    (p.symbol === symbol && livePrice ? livePrice : markPrices[p.symbol]) ?? p.entryPrice;

  // 全仓池按 (user, symbol) 分桶：先汇总当前 symbol 下所有全仓腿的盈亏与名义值，
  // 再对每行扣掉自身贡献，得到「同池其他腿」的量。
  // 其他 symbol 的持仓拿不到本轮池余额（crossPool 传 0），由 calcPositionRisk 回退到杠杆反推。
  const risks = new Map<string, PositionRisk>();
  {
    let sumPnl = 0;
    let sumNotional = 0;
    const self = new Map<string, { pnl: number; notional: number }>();
    for (const p of mine) {
      if (p.marginMode !== "cross") continue;
      const mark = markOf(p);
      const stat = { pnl: calcPnl(p.side, p.entryPrice, mark, p.qty), notional: mark * p.qty };
      self.set(p.id, stat);
      sumPnl += stat.pnl;
      sumNotional += stat.notional;
    }
    for (const p of rows) {
      const own = self.get(p.id); // 有值 ⟺ 该仓在当前 symbol 且为全仓
      risks.set(
        p.id,
        calcPositionRisk({
          side: p.side,
          entryPrice: p.entryPrice,
          qty: p.qty,
          markPrice: markOf(p),
          leverage: p.leverage,
          positionMargin: p.margin,
          mode: p.marginMode,
          crossPool: own ? crossPool : 0,
          otherPnl: own ? sumPnl - own.pnl : 0,
          otherNotional: own ? sumNotional - own.notional : 0,
        })
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card" data-testid="positions-panel">
      <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">{t("trade.positions.title")}</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mine.length === 0 && others.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted" data-testid="positions-empty">
            {t("trade.positions.empty")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-3 py-2 text-left font-normal">{t("trade.positions.col.contract")}</th>
                <th className="px-3 py-2 text-left font-normal">{t("trade.positions.col.side")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.entry")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.mark")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.liqPrice")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.pnl")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.marginRatio")}</th>
                <th className="px-3 py-2 text-left font-normal">{t("trade.positions.col.tpSl")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("trade.positions.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <PositionRow key={p.id} pos={p} risk={risks.get(p.id)!} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PositionRow({ pos, risk }: { pos: Position; risk: PositionRisk }) {
  const { t } = useTranslation();
  const close = useFuturesStore((s) => s.close);
  const setTpSl = useFuturesStore((s) => s.setTpSl);
  const confirm = useConfirm();
  const toast = useToast();
  const [tpslOpen, setTpslOpen] = useState(false);

  const mark = risk.markPrice;
  const pnl = risk.pnl;
  const roePct = risk.roePct;
  const marginRatio = risk.marginRatio;
  const win = pnl >= 0;

  const onMarketClose = async () => {
    const ok = await confirm({
      title: t("trade.positions.closeConfirm.title"),
      message: (
        <span>
          Close <b>{pos.side === "long" ? t("trade.positions.long") : t("trade.positions.short")}</b> {fmtQty(pos.qty)} {pos.symbol} {t("trade.positions.closeConfirm.atMarket")}{" "}
          Est. PNL <b className={win ? "text-buy" : "text-sell"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT</b>
        </span>
      ),
      danger: true,
      confirmText: t("trade.positions.closeConfirm.confirm"),
    });
    if (!ok) return;
    try {
      // 平仓走服务端（action=close），以服务端结算的已实现盈亏为准
      const r = await api.futuresPlaceOrder({
        symbol: pos.symbol,
        action: "close",
        pos_side: pos.side,
        qty: pos.qty,
      });
      close(pos.id);
      const realized = typeof r.realized_pnl === "number" ? r.realized_pnl : pnl;
      toast.success(t("trade.positions.toast.closed", { sign: realized >= 0 ? "+" : "", amount: realized.toFixed(2) }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e : (e as Error).message || t("trade.positions.toast.closeFailed"));
    }
  };

  return (
    <tr className="border-t border-border/60 hover:bg-panel-2/30">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <a href={`#/trade/${pos.symbol}`} className="font-semibold hover:text-accent">
            {pos.symbol.replace(/USDT$/, "")}
            <span className="text-muted">{t("trade.positions.perp")}</span>
          </a>
          <span className="rounded border border-border px-1 text-[10px] font-bold text-muted">{pos.leverage}x</span>
          <span
            className="rounded border border-border px-1 text-[10px] text-muted"
            data-testid={`margin-mode-${pos.id}`}
            title={pos.marginMode === "cross" ? t("trade.leverage.cross") : t("trade.leverage.isolated")}
          >
            {pos.marginMode === "cross" ? t("trade.leverage.cross") : t("trade.leverage.isolated")}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            pos.side === "long" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
          )}
        >
          {pos.side === "long" ? t("trade.positions.longFull") : t("trade.positions.shortFull")}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPrice(pos.entryPrice)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPrice(mark)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-accent" data-testid={`liq-${pos.id}`}>
        {risk.liquidationPrice > 0 ? fmtPrice(risk.liquidationPrice) : "--"}
      </td>
      <td
        className={cn("px-3 py-2.5 text-right font-mono tabular-nums", win ? "text-buy" : "text-sell")}
        data-testid={`pnl-${pos.id}`}
      >
        {win ? "+" : ""}
        {pnl.toFixed(2)}
        <span className="ml-1 text-[11px] opacity-80">
          ({roePct >= 0 ? "+" : ""}
          {roePct.toFixed(2)}%)
        </span>
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right font-mono tabular-nums",
          marginRatio > 80 ? "text-sell" : marginRatio > 50 ? "text-accent" : "text-muted"
        )}
      >
        {Number.isFinite(marginRatio) ? `${marginRatio.toFixed(2)}%` : "--"}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted" data-testid={`tpsl-${pos.id}`}>
        {pos.tp || pos.sl ? (
          <span>
            <span className="text-buy">{pos.tp ? `TP ${fmtPrice(pos.tp)}` : "TP --"}</span>
            {" / "}
            <span className="text-sell">{pos.sl ? `SL ${fmtPrice(pos.sl)}` : "SL --"}</span>
          </span>
        ) : (
          "--"
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex justify-end gap-1.5">
          <button
            onClick={() => setTpslOpen(true)}
            data-testid={`tpsl-btn-${pos.id}`}
            className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
          >
            {t("trade.positions.action.tpsl")}
          </button>
          <button
            onClick={onMarketClose}
            data-testid={`close-${pos.id}`}
            className="cursor-pointer rounded-md bg-sell px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-sell/90"
          >
            {t("trade.positions.action.marketClose")}
          </button>
        </div>
      </td>

      {tpslOpen && (
        <TpSlModal
          pos={pos}
          onClose={() => setTpslOpen(false)}
          onSave={async (tp, sl) => {
            try {
              // 服务端持久化（PUT /futures/tpsl），成功后本地镜像；轮询水合不会丢失
              await api.futuresSetTpSl({
                symbol: pos.symbol,
                pos_side: pos.side,
                tp: tp ?? null,
                sl: sl ?? null,
              });
              setTpSl(pos.id, tp, sl);
              setTpslOpen(false);
              toast.success(t("trade.positions.toast.tpslUpdated"));
            } catch (e) {
              toast.error(e instanceof ApiError ? e : (e as Error).message || t("trade.positions.toast.tpslFailed"));
            }
          }}
        />
      )}
    </tr>
  );
}

function TpSlModal({
  pos,
  onClose,
  onSave,
}: {
  pos: Position;
  onClose: () => void;
  onSave: (tp: number | undefined, sl: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const [tpStr, setTpStr] = useState(pos.tp ? String(pos.tp) : "");
  const [slStr, setSlStr] = useState(pos.sl ? String(pos.sl) : "");

  const tp = parseFloat(tpStr) > 0 ? parseFloat(tpStr) : undefined;
  const sl = parseFloat(slStr) > 0 ? parseFloat(slStr) : undefined;

  return (
    <Modal
      title={`TP/SL · ${pos.symbol} ${pos.side === "long" ? t("trade.positions.longFull") : t("trade.positions.shortFull")} ${pos.leverage}x`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" data-testid="tpsl-save" onClick={() => onSave(tp, sl)}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("trade.positions.tpSlModal.takeProfitLabel")}
          <input
            inputMode="decimal"
            value={tpStr}
            onChange={(e) => setTpStr(e.target.value)}
            data-testid="tp-input"
            placeholder={t("trade.positions.tpSlModal.tpPlaceholder")}
            className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus:border-buy"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("trade.positions.tpSlModal.stopLossLabel")}
          <input
            inputMode="decimal"
            value={slStr}
            onChange={(e) => setSlStr(e.target.value)}
            data-testid="sl-input"
            placeholder={t("trade.positions.tpSlModal.slPlaceholder")}
            className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus:border-sell"
          />
        </label>
        <p className="text-[11px] text-muted">{t("trade.positions.tpSlModal.hint")}</p>
      </div>
    </Modal>
  );
}
