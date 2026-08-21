// 未结平仓头寸面板：合约对/杠杆/开仓均价/标记价格/未实现盈亏（着色）/保证金率。
// 提供 Market Close（确认弹窗）与 TP/SL 设置弹窗；标记价格用实时行情现算。
import { useState } from "react";
import { useFuturesStore, type Position } from "../../store/futures-store";
import { useTickerLive } from "../../hooks/use-ticker-live";
import { calcMarginRatio, calcPnl } from "../../lib/futures-math";
import { fmtPrice, fmtQty } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Modal } from "../Modal";
import { useConfirm } from "../Confirm";
import { useToast } from "../Toast";

export function PositionsPanel({ symbol }: { symbol: string }) {
  const positions = useFuturesStore((s) => s.positions);
  const mine = positions.filter((p) => p.symbol === symbol);
  const others = positions.filter((p) => p.symbol !== symbol);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card" data-testid="positions-panel">
      <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">Positions</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mine.length === 0 && others.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted" data-testid="positions-empty">
            No open positions
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-3 py-2 text-left font-normal">Contract</th>
                <th className="px-3 py-2 text-left font-normal">Side</th>
                <th className="px-3 py-2 text-right font-normal">Entry</th>
                <th className="px-3 py-2 text-right font-normal">Mark</th>
                <th className="px-3 py-2 text-right font-normal">PNL (ROE)</th>
                <th className="px-3 py-2 text-right font-normal">Margin Ratio</th>
                <th className="px-3 py-2 text-left font-normal">TP/SL</th>
                <th className="px-3 py-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...mine, ...others].map((p) => (
                <PositionRow key={p.id} pos={p} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PositionRow({ pos }: { pos: Position }) {
  const close = useFuturesStore((s) => s.close);
  const setTpSl = useFuturesStore((s) => s.setTpSl);
  const confirm = useConfirm();
  const toast = useToast();
  const [tpslOpen, setTpslOpen] = useState(false);

  // 标记价格：实时行情最新价
  const { ticker } = useTickerLive(pos.symbol);
  const mark = ticker?.lastPrice ?? pos.entryPrice;
  const pnl = calcPnl(pos.side, pos.entryPrice, mark, pos.qty);
  const roePct = (pnl / (pos.margin || 1)) * 100;
  const marginRatio = calcMarginRatio(pnl, pos.margin, mark * pos.qty);
  const win = pnl >= 0;

  const onMarketClose = async () => {
    const ok = await confirm({
      title: "Market Close",
      message: (
        <span>
          Close <b>{pos.side === "long" ? "LONG" : "SHORT"}</b> {fmtQty(pos.qty)} {pos.symbol} at market?{" "}
          Est. PNL <b className={win ? "text-buy" : "text-sell"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT</b>
        </span>
      ),
      danger: true,
      confirmText: "Confirm Close",
    });
    if (ok) {
      close(pos.id);
      toast.success(`Position closed · realized ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`);
    }
  };

  return (
    <tr className="border-t border-border/60 hover:bg-panel-2/30">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <a href={`#/trade/${pos.symbol}`} className="font-semibold hover:text-accent">
            {pos.symbol.replace(/USDT$/, "")}
            <span className="text-muted">Perp</span>
          </a>
          <span className="rounded border border-border px-1 text-[10px] font-bold text-muted">{pos.leverage}x</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            pos.side === "long" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
          )}
        >
          {pos.side === "long" ? "Long" : "Short"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPrice(pos.entryPrice)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPrice(mark)}</td>
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
            TP/SL
          </button>
          <button
            onClick={onMarketClose}
            data-testid={`close-${pos.id}`}
            className="cursor-pointer rounded-md bg-sell px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-sell/90"
          >
            Market Close
          </button>
        </div>
      </td>

      {tpslOpen && (
        <TpSlModal
          pos={pos}
          onClose={() => setTpslOpen(false)}
          onSave={(tp, sl) => {
            setTpSl(pos.id, tp, sl);
            setTpslOpen(false);
            toast.success("TP/SL updated");
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
  const [tpStr, setTpStr] = useState(pos.tp ? String(pos.tp) : "");
  const [slStr, setSlStr] = useState(pos.sl ? String(pos.sl) : "");

  const tp = parseFloat(tpStr) > 0 ? parseFloat(tpStr) : undefined;
  const sl = parseFloat(slStr) > 0 ? parseFloat(slStr) : undefined;

  return (
    <Modal
      title={`TP/SL · ${pos.symbol} ${pos.side === "long" ? "Long" : "Short"} ${pos.leverage}x`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" data-testid="tpsl-save" onClick={() => onSave(tp, sl)}>
            Save
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Take Profit trigger price (USDT)
          <input
            inputMode="decimal"
            value={tpStr}
            onChange={(e) => setTpStr(e.target.value)}
            data-testid="tp-input"
            placeholder="e.g. 55000"
            className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus:border-buy"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Stop Loss trigger price (USDT)
          <input
            inputMode="decimal"
            value={slStr}
            onChange={(e) => setSlStr(e.target.value)}
            data-testid="sl-input"
            placeholder="e.g. 45000"
            className="h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus:border-sell"
          />
        </label>
        <p className="text-[11px] text-muted">Leave a field empty to remove that trigger.</p>
      </div>
    </Modal>
  );
}
