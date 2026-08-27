import { useEffect, useState } from "react";
import {
  api,
  type BotStrategy,
  type BotOrder,
  type GridState,
} from "../api/client";
import { useConfirm } from "../components/Confirm";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";

const STATUS_KEY: Record<string, string> = {
  active: "bot.status.active",
  stopped: "bot.status.stopped",
};
const TYPE_KEY: Record<string, string> = {
  grid: "bot.type.grid",
  dca: "bot.type.dca",
  ma: "bot.type.ma",
};
const MARKET_KEY: Record<string, string> = {
  spot: "bot.market.spot",
  futures: "bot.market.futures",
};

function fmtPnL(n: number): string {
  const s = Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n >= 0 ? `+${s}` : s;
}

export function BotGrid() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [strategies, setStrategies] = useState<BotStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [token, setToken] = useState("");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [gridNum, setGridNum] = useState("");
  const [orderAmt, setOrderAmt] = useState("");
  const [maxPos, setMaxPos] = useState("");
  const [creating, setCreating] = useState(false);

  // Orders view
  const [viewOrders, setViewOrders] = useState<BotStrategy | null>(null);
  const [orders, setOrders] = useState<BotOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  async function loadStrategies() {
    setLoading(true);
    setErr("");
    try {
      setStrategies(await api.botStrategies());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStrategies();
  }, []);

  async function createStrategy() {
    setErr("");
    setMsg("");
    if (!name.trim() || !symbol.trim() || !token.trim() || !lower || !upper || !gridNum || !(Number(orderAmt) > 0)) {
      setErr(t("bot.form.err"));
      return;
    }
    const lo = Number(lower);
    const hi = Number(upper);
    const gn = Number(gridNum);
    if (lo >= hi) {
      setErr(t("bot.form.errRange"));
      return;
    }
    if (!(gn >= 2)) {
      setErr(t("bot.form.errGridNum"));
      return;
    }
    setCreating(true);
    try {
      await api.botCreateStrategy({
        name: name.trim(),
        market: "spot",
        symbol: symbol.trim(),
        side: "buy",
        type: "grid",
        user_token: token.trim(),
        params: {
          grid_lower: lo,
          grid_upper: hi,
          grid_num: gn,
          order_amount: Number(orderAmt),
          max_position: maxPos ? Number(maxPos) : 0,
        },
      });
      setMsg(t("bot.form.created"));
      setShowForm(false);
      setName("");
      setSymbol("");
      setToken("");
      setLower("");
      setUpper("");
      setGridNum("");
      setOrderAmt("");
      setMaxPos("");
      await loadStrategies();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleStrategy(s: BotStrategy) {
    setErr("");
    setMsg("");
    const isActive = s.status === "active";
    const key = isActive ? "bot.confirmStop" : "bot.confirmStart";
    const ok = await confirm({
      title: isActive ? t("bot.stop") : t("bot.start"),
      message: t(key, { name: s.name }),
      danger: isActive,
      confirmText: isActive ? t("bot.stop") : t("bot.start"),
    });
    if (!ok) return;
    try {
      if (isActive) {
        await api.botStopStrategy(s.id);
      } else {
        await api.botStartStrategy(s.id);
      }
      await loadStrategies();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function viewStrategyOrders(s: BotStrategy) {
    setViewOrders(s);
    setOrdersLoading(true);
    try {
      setOrders(await api.botStrategyOrders(s.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOrdersLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("bot.title")}</h2>
        <div className="card-actions">
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {t("bot.create")}
          </button>
          <button className="refresh" disabled={loading} onClick={loadStrategies}>
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <InlineError err={err} failKey="bot.fail" />
      {msg && <div className="ok">{msg}</div>}

      {/* Create form */}
      {showForm && (
        <section className="card">
          <div className="card-head">
            <h3>{t("bot.form.title")}</h3>
          </div>
          <div className="form-field">
            <span className="form-label">{t("bot.form.name")}</span>
            <input className="filter" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("bot.form.namePh")} />
          </div>
          <div className="form-field">
            <span className="form-label">{t("bot.form.symbol")}</span>
            <input className="filter" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={t("bot.form.symbolPh")} />
          </div>
          <div className="form-field">
            <span className="form-label">{t("bot.form.token")}</span>
            <input className="filter" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("bot.form.tokenPh")} type="password" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="form-field">
              <span className="form-label">{t("bot.form.lower")}</span>
              <input className="filter" type="number" min="0" step="any" value={lower} onChange={(e) => setLower(e.target.value)} />
            </div>
            <div className="form-field">
              <span className="form-label">{t("bot.form.upper")}</span>
              <input className="filter" type="number" min="0" step="any" value={upper} onChange={(e) => setUpper(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="form-field">
              <span className="form-label">{t("bot.form.gridNum")}</span>
              <input className="filter" type="number" min="2" value={gridNum} onChange={(e) => setGridNum(e.target.value)} />
            </div>
            <div className="form-field">
              <span className="form-label">{t("bot.form.orderAmount")}</span>
              <input className="filter" type="number" min="0" step="any" value={orderAmt} onChange={(e) => setOrderAmt(e.target.value)} />
            </div>
            <div className="form-field">
              <span className="form-label">{t("bot.form.maxPos")}</span>
              <input className="filter" type="number" min="0" step="any" value={maxPos} onChange={(e) => setMaxPos(e.target.value)} />
            </div>
          </div>
          <div className="row-actions">
            <button className="btn primary" disabled={creating} onClick={createStrategy}>
              {creating ? t("bot.form.creating") : t("bot.form.submit")}
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {/* Strategy list */}
      <section className="card">
        <div className="card-head">
          <h3>{t("bot.strategies")}</h3>
        </div>
        {loading && strategies.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && strategies.length === 0 && <div className="muted">{t("bot.noStrategies")}</div>}
        {strategies.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("bot.col.id")}</th>
                  <th>{t("bot.col.name")}</th>
                  <th>{t("bot.col.symbol")}</th>
                  <th>{t("bot.col.market")}</th>
                  <th>{t("bot.col.type")}</th>
                  <th>{t("bot.col.status")}</th>
                  <th>{t("bot.col.pnl")}</th>
                  <th>{t("bot.col.trades")}</th>
                  <th>{t("bot.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((s) => {
                  const gs = s.grid_state as GridState | undefined;
                  return (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.name}</td>
                      <td>{s.symbol}</td>
                      <td>{t(MARKET_KEY[s.market] ?? s.market)}</td>
                      <td>{t(TYPE_KEY[s.type] ?? s.type)}</td>
                      <td>
                        <span className={`ostatus ${s.status === "active" ? "completed" : "cancelled"}`}>
                          {t(STATUS_KEY[s.status] ?? s.status)}
                        </span>
                      </td>
                       <td className={(gs?.pnl ?? 0) >= 0 ? "text-buy" : "text-sell"}>
                        {gs ? fmtPnL(gs.pnl) : "—"}
                      </td>
                      <td>{gs?.trade_count ?? 0}</td>
                      <td className="row-actions">
                        <button className="link-btn" onClick={() => toggleStrategy(s)}>
                          {s.status === "active" ? t("bot.stop") : t("bot.start")}
                        </button>
                        {s.type === "grid" && (
                          <button className="link-btn" onClick={() => viewStrategyOrders(s)}>
                            {t("bot.viewOrders")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Grid summary for viewed strategy */}
      {viewOrders && viewOrders.grid_state && (
        <section className="card">
          <div className="card-head">
            <h3>{t("bot.gridSummary")} — {viewOrders.name}</h3>
          </div>
          <div className="kv">
            {([
              ["bot.gridLower", viewOrders.params.grid_lower],
              ["bot.gridUpper", viewOrders.params.grid_upper],
              ["bot.gridNum", viewOrders.params.grid_num],
              ["bot.gridStep", viewOrders.params.grid_lower != null && viewOrders.params.grid_upper != null && viewOrders.params.grid_num
                ? ((viewOrders.params.grid_upper - viewOrders.params.grid_lower) / Math.max(1, viewOrders.params.grid_num - 1)).toFixed(4)
                : "—"],
              ["bot.gridPosition", viewOrders.grid_state.position],
              ["bot.gridPendingBuys", viewOrders.grid_state.levels?.filter((l) => l.placed && !l.filled && l.side === "buy").length ?? 0],
              ["bot.gridPendingSells", viewOrders.grid_state.levels?.filter((l) => l.placed && !l.filled && l.side === "sell").length ?? 0],
              ["bot.gridFilledBuys", viewOrders.grid_state.levels?.filter((l) => l.filled && l.side === "buy").length ?? 0],
              ["bot.gridFilledSells", viewOrders.grid_state.levels?.filter((l) => l.filled && l.side === "sell").length ?? 0],
            ] as [string, string | number][]).map(([k, v]) => (
              <div key={k} className="kv-row">
                <span className="kv-k">{t(k)}</span>
                <span className="kv-v">{String(v)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orders for viewed strategy */}
      {viewOrders && (
        <section className="card">
          <div className="card-head">
            <h3>{t("bot.orders")} — {viewOrders.name}</h3>
            <button className="btn" onClick={() => setViewOrders(null)}>{t("common.close")}</button>
          </div>
          {ordersLoading && <div className="muted">{t("common.loading")}</div>}
          {!ordersLoading && orders.length === 0 && <div className="muted">{t("bot.noOrders")}</div>}
          {orders.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("bot.col.id")}</th>
                    <th>{t("bot.col.side")}</th>
                    <th>{t("bot.col.symbol")}</th>
                    <th>{t("bot.col.price")}</th>
                    <th>{t("bot.col.qty")}</th>
                    <th>{t("lending.col.status")}</th>
                    <th>{t("bot.col.time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.side}</td>
                      <td>{o.symbol}</td>
                      <td>{o.price}</td>
                      <td>{o.qty}</td>
                      <td>
                        <span className={`ostatus ${o.status}`}>{o.status}</span>
                      </td>
                      <td>{o.created_at ? new Date(o.created_at / 1e6).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
