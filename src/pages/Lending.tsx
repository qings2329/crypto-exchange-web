import { useEffect, useState } from "react";
import { api, type LendingPool, type LendOrder, type BorrowOrder } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";

const LEND_STATUS: Record<string, string> = {
  active: "lending.status.active",
  withdrawn: "lending.status.withdrawn",
};
const BORROW_STATUS: Record<string, string> = {
  active: "lending.status.active",
  repaid: "lending.status.repaid",
  liquidated: "lending.status.liquidated",
};

function fmtRate(r: number): string {
  return (r * 100).toFixed(2) + "%";
}

export function Lending() {
  const { t } = useI18n();
  const [pools, setPools] = useState<LendingPool[]>([]);
  const [lends, setLends] = useState<LendOrder[]>([]);
  const [borrows, setBorrows] = useState<BorrowOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Lend form
  const [lendPoolId, setLendPoolId] = useState(0);
  const [lendAmount, setLendAmount] = useState("");
  const [lending, setLending] = useState(false);

  // Borrow form
  const [borrowPoolId, setBorrowPoolId] = useState(0);
  const [borrowAmt, setBorrowAmt] = useState("");
  const [collateral, setCollateral] = useState("");
  const [borrowing, setBorrowing] = useState(false);

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      const [ps, ls, bs] = await Promise.all([
        api.lendingPools(),
        api.lendingMyLends(),
        api.lendingMyBorrows(),
      ]);
      setPools(ps);
      setLends(ls);
      setBorrows(bs);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const poolById = new Map(pools.map((p) => [p.id, p]));

  async function doLend() {
    setErr("");
    setMsg("");
    if (!lendPoolId) {
      setErr(t("lending.errPool"));
      return;
    }
    const amt = lendAmount.trim();
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) {
      setErr(t("lending.errAmount"));
      return;
    }
    setLending(true);
    try {
      await api.lendingLend(lendPoolId, amt);
      setMsg(t("lending.lendOk"));
      setLendAmount("");
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLending(false);
    }
  }

  async function doBorrow() {
    setErr("");
    setMsg("");
    if (!borrowPoolId) {
      setErr(t("lending.errPool"));
      return;
    }
    if (!borrowAmt.trim() || isNaN(Number(borrowAmt)) || Number(borrowAmt) <= 0) {
      setErr(t("lending.errAmount"));
      return;
    }
    if (!collateral.trim() || isNaN(Number(collateral)) || Number(collateral) <= 0) {
      setErr(t("lending.errCollateral"));
      return;
    }
    setBorrowing(true);
    try {
      await api.lendingBorrow(borrowPoolId, borrowAmt.trim(), collateral.trim());
      setMsg(t("lending.borrowOk"));
      setBorrowAmt("");
      setCollateral("");
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBorrowing(false);
    }
  }

  async function doWithdraw(order: LendOrder) {
    setErr("");
    setMsg("");
    try {
      await api.lendingWithdraw(order.id);
      setMsg(t("lending.withdrawOk"));
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function doRepay(order: BorrowOrder) {
    setErr("");
    setMsg("");
    try {
      await api.lendingRepay(order.id);
      setMsg(t("lending.repayOk"));
      await loadAll();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("lending.title")}</h2>
        <button className="refresh" disabled={loading} onClick={loadAll}>
          {t("common.refresh")}
        </button>
      </div>

      <InlineError err={err} failKey="lending.fail" />
      {msg && <div className="ok">{msg}</div>}

      {/* Pool list */}
      <section className="card">
        <div className="card-head">
          <h3>{t("lending.pools")}</h3>
        </div>
        {pools.length === 0 && !loading && <div className="muted">{t("lending.noPools")}</div>}
        {pools.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("lending.col.asset")}</th>
                  <th>{t("lending.col.supply")}</th>
                  <th>{t("lending.col.borrow")}</th>
                  <th>{t("lending.col.available")}</th>
                  <th>{t("lending.col.rate")}</th>
                  <th>{t("lending.col.collateral")}</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.asset}</strong></td>
                    <td>{p.total_supply}</td>
                    <td>{p.total_borrow}</td>
                    <td>{p.available}</td>
                    <td>{fmtRate(p.interest_rate)}</td>
                    <td>{fmtRate(p.collateral_req)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lend + Borrow forms side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap, 16px)" }}>
        <section className="card">
          <div className="card-head">
            <h3>{t("lending.lend")}</h3>
          </div>
          <div className="form-field">
            <span className="form-label">{t("lending.pools")}</span>
            <select className="form-select" value={lendPoolId} onChange={(e) => setLendPoolId(Number(e.target.value))}>
              <option value={0}>{t("otc.selectPlaceholder")}</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.asset} · {fmtRate(p.interest_rate)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <span className="form-label">{t("lending.amount")}</span>
            <input
              className="filter"
              type="number"
              min="0"
              step="any"
              value={lendAmount}
              onChange={(e) => setLendAmount(e.target.value)}
              placeholder={t("lending.amountPh")}
            />
          </div>
          <div className="row-actions">
            <button className="btn primary" disabled={lending || !lendPoolId} onClick={doLend}>
              {lending ? t("lending.lending") : t("lending.submitLend")}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("lending.borrow")}</h3>
          </div>
          <div className="form-field">
            <span className="form-label">{t("lending.pools")}</span>
            <select className="form-select" value={borrowPoolId} onChange={(e) => setBorrowPoolId(Number(e.target.value))}>
              <option value={0}>{t("otc.selectPlaceholder")}</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.asset} · {fmtRate(p.interest_rate)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <span className="form-label">{t("lending.amount")}</span>
            <input
              className="filter"
              type="number"
              min="0"
              step="any"
              value={borrowAmt}
              onChange={(e) => setBorrowAmt(e.target.value)}
              placeholder={t("lending.amountPh")}
            />
          </div>
          <div className="form-field">
            <span className="form-label">{t("lending.collateralLabel")}</span>
            <input
              className="filter"
              type="number"
              min="0"
              step="any"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder={t("lending.collateralPh")}
            />
          </div>
          <div className="row-actions">
            <button className="btn primary" disabled={borrowing || !borrowPoolId} onClick={doBorrow}>
              {borrowing ? t("lending.borrowing") : t("lending.submitBorrow")}
            </button>
          </div>
        </section>
      </div>

      {/* My Lends */}
      <section className="card">
        <div className="card-head">
          <h3>{t("lending.myLends")}</h3>
        </div>
        {loading && lends.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && lends.length === 0 && <div className="muted">{t("lending.noLends")}</div>}
        {lends.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("lending.col.id")}</th>
                  <th>{t("lending.col.poolId")}</th>
                  <th>{t("lending.col.amount")}</th>
                  <th>{t("lending.col.rate2")}</th>
                  <th>{t("lending.col.status")}</th>
                  <th>{t("lending.col.action2")}</th>
                </tr>
              </thead>
              <tbody>
                {lends.map((l) => {
                  const pool = poolById.get(l.pool_id);
                  return (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td>{pool ? pool.asset : `#${l.pool_id}`}</td>
                      <td>{l.amount}</td>
                      <td>{fmtRate(l.rate)}</td>
                      <td>
                        <span className={`ostatus ${l.status}`}>
                          {t(LEND_STATUS[l.status] ?? `lending.status.${l.status}`)}
                        </span>
                      </td>
                      <td>
                        {l.status === "active" && (
                          <button className="link-btn" onClick={() => doWithdraw(l)}>
                            {t("lending.withdraw")}
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

      {/* My Borrows */}
      <section className="card">
        <div className="card-head">
          <h3>{t("lending.myBorrows")}</h3>
        </div>
        {loading && borrows.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && borrows.length === 0 && <div className="muted">{t("lending.noBorrows")}</div>}
        {borrows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("lending.col.id")}</th>
                  <th>{t("lending.col.poolId")}</th>
                  <th>{t("lending.col.amount")}</th>
                  <th>{t("lending.col.collateral")}</th>
                  <th>{t("lending.col.rate2")}</th>
                  <th>{t("lending.col.interest")}</th>
                  <th>{t("lending.col.status")}</th>
                  <th>{t("lending.col.action2")}</th>
                </tr>
              </thead>
              <tbody>
                {borrows.map((b) => {
                  const pool = poolById.get(b.pool_id);
                  return (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{pool ? pool.asset : `#${b.pool_id}`}</td>
                      <td>{b.amount}</td>
                      <td>{b.collateral}</td>
                      <td>{fmtRate(b.rate)}</td>
                      <td>{b.interest_acc}</td>
                      <td>
                        <span className={`ostatus ${b.status}`}>
                          {t(BORROW_STATUS[b.status] ?? `lending.status.${b.status}`)}
                        </span>
                      </td>
                      <td>
                        {b.status === "active" && (
                          <button className="link-btn" onClick={() => doRepay(b)}>
                            {t("lending.repay")}
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
    </div>
  );
}
