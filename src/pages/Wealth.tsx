import { useEffect, useState } from "react";
import { api, type WealthProduct, type WealthHolding } from "../api/client";
import { useI18n } from "../i18n";

// 产品类型 -> 文案 key（对齐 wealth.type.*）。
const TYPE_KEY: Record<string, string> = { current: "wealth.type.current", fixed: "wealth.type.fixed" };
// 持仓状态 -> 文案 key（对齐 wealth.status.*）。
const STATUS_KEY: Record<string, string> = {
  open: "wealth.status.open",
  closed: "wealth.status.closed",
  active: "wealth.status.active",
  funding: "wealth.status.funding",
  redeemed: "wealth.status.redeemed",
};

// 金额格式化（后端按人类可读十进制数字序列化，最多显示 6 位小数）。
function fmtNum(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
}
// 年化率格式化：0.05 -> 5%。
function fmtRate(r: number): string {
  return (r * 100).toFixed(2) + "%";
}

export function Wealth() {
  const { t } = useI18n();
  const [products, setProducts] = useState<WealthProduct[]>([]);
  const [holdings, setHoldings] = useState<WealthHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // 认购表单
  const [productId, setProductId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  // 赎回中的持仓 id（用于禁用按钮）
  const [redeemingId, setRedeemingId] = useState<number | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      const [ps, hs] = await Promise.all([
        api.wealthProducts(),
        api.wealthHoldings(),
      ]);
      setProducts((ps as { products?: WealthProduct[] }).products ?? []);
      setHoldings((hs as { holdings?: WealthHolding[] }).holdings ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const openProducts = products.filter((p) => p.status === "open");
  const productById = new Map(products.map((p) => [p.id, p]));

  async function subscribe() {
    setErr("");
    setMsg("");
    const pid = productId;
    const amt = Number(amount);
    if (!pid) {
      setErr(t("wealth.pleaseSelect"));
      return;
    }
    if (!isFinite(amt) || amt <= 0) {
      setErr(t("wealth.amountGt0"));
      return;
    }
    const p = productById.get(pid);
    if (p && amt < p.min_amount) {
      setErr(t("wealth.belowMin", { amount: fmtNum(p.min_amount), asset: p.asset }));
      return;
    }
    setSubscribing(true);
    try {
      await api.wealthSubscribe(pid, amt);
      setMsg(t("wealth.subscribeOk"));
      setAmount("");
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubscribing(false);
    }
  }

  async function redeem(h: WealthHolding) {
    setErr("");
    setMsg("");
    if (h.status !== "active") {
      setErr(t("wealth.onlyActive"));
      return;
    }
    setRedeemingId(h.id);
    try {
      await api.wealthRedeem(h.id);
      setMsg(t("wealth.redeemed", { id: h.id }));
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRedeemingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("wealth.title")}</h2>
        <button className="refresh" disabled={loading} onClick={loadAll}>
          {t("common.refresh")}
        </button>
      </div>

      {err && <div className="error">{t("wealth.fail", { err })}</div>}
      {msg && <div className="ok">{msg}</div>}

      {/* 认购 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("wealth.subscribe")}</h3>
        </div>
        {openProducts.length === 0 ? (
          <div className="muted">{t("wealth.noProducts")}</div>
        ) : (
          <div>
            <div className="form-field">
              <span className="form-label">{t("wealth.product")}</span>
              <select className="form-select" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
                <option value={0}>{t("otc.selectPlaceholder")}</option>
                {openProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.asset} · {t(TYPE_KEY[p.type] ?? `wealth.type.${p.type}`)} · {fmtRate(p.annual_rate)}
                    {p.type === "fixed" && p.duration_days > 0 ? ` · ${t("wealth.days", { n: p.duration_days })}` : ""} ·{" "}
                    {t("wealth.minAmount", { amount: fmtNum(p.min_amount) })}）
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <span className="form-label">{t("wealth.amount")}</span>
              <input
                className="filter"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("wealth.amountPh")}
              />
            </div>
            <div className="row-actions">
              <button className="btn primary" disabled={subscribing || !productId} onClick={subscribe}>
                {subscribing ? t("wealth.subscribing") : t("wealth.subscribeBtn")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 我的持仓 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("wealth.holdings")}</h3>
        </div>
        {loading && holdings.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && holdings.length === 0 && <div className="muted">{t("wealth.noHoldings")}</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("wealth.col.id")}</th>
                <th>{t("wealth.col.product")}</th>
                <th>{t("wealth.col.asset")}</th>
                <th>{t("wealth.col.principal")}</th>
                <th>{t("wealth.col.yield")}</th>
                <th>{t("wealth.col.status")}</th>
                <th>{t("wealth.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const p = productById.get(h.product_id);
                return (
                  <tr key={h.id}>
                    <td>{h.id}</td>
                    <td>{p ? p.name : `#${h.product_id}`}</td>
                    <td>{h.asset}</td>
                    <td className="mono">{fmtNum(h.principal)}</td>
                    <td className="mono">{fmtNum(h.accrued_yield)}</td>
                    <td>
                      <span className={`ostatus ${h.status}`}>
                        {t(STATUS_KEY[h.status] ?? `wealth.status.${h.status}`)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="link-btn"
                        disabled={redeemingId === h.id || h.status !== "active"}
                        onClick={() => redeem(h)}
                      >
                        {redeemingId === h.id ? t("wealth.redeeming") : t("wealth.redeem")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
