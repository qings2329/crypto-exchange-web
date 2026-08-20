import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/Confirm";
import { useSelection, BatchBar, type BatchAction } from "../components/Batch";
import { ApiTable } from "../components/ApiTable";
import { useI18n } from "../i18n";

export function Futures() {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("page.futures")}</h2>
      </div>
      <WithdrawReview />
      <PositionLiquidation />
      <div className="grid-2">
        <ApiTable title={t("futures.funding")} endpoint="/api/v1/futures/funding" />
        <ApiTable title={t("futures.index")} endpoint="/api/v1/futures/index" />
      </div>
      <ApiTable title={t("futures.balance")} endpoint="/api/v1/futures/wallet/balance" />
    </div>
  );
}

function WithdrawReview() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const ids = useMemo(() => (rows ?? []).map((w) => w.id), [rows]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setRows(undefined);
    api.futuresWithdraws().then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const review = async (w: any, action: "approve" | "reject") => {
    if (w.status !== "pending") return;
    const label = action === "approve" ? t("futures.approve") : t("futures.reject");
    if (!(await confirm({ title: label, message: t(action === "approve" ? "confirm.reviewApprove" : "confirm.reviewReject", { name: `#${w.id}`, extra: `${w.asset} ${w.amount}` }), danger: action === "reject", confirmText: label })))
      return;
    await api.futuresReviewWithdraw(w.id, action);
    load();
  };

  // 批量审核仅作用于选中项中的 pending 记录，避免对非待审状态误操作。
  const pendingOf = (sel: (string | number)[]) =>
    (rows ?? []).filter((w) => sel.includes(w.id) && w.status === "pending").map((w) => w.id);

  const batchActions: BatchAction[] = [
    {
      key: "approve",
      label: t("futures.batchApprove"),
      run: async (sel) => {
        const target = pendingOf(sel);
        if (target.length === 0) return;
        const ok = await confirm({
          title: t("futures.batchApprove"),
          message: t("confirm.batchApprove", { n: target.length }),
          confirmText: t("futures.approve"),
        });
        if (!ok) return;
        await api.futuresBatchReviewWithdraw(target, "approve");
        load();
      },
    },
    {
      key: "reject",
      label: t("futures.batchReject"),
      danger: true,
      run: async (sel) => {
        const target = pendingOf(sel);
        if (target.length === 0) return;
        const ok = await confirm({
          title: t("futures.batchReject"),
          message: t("confirm.batchReject", { n: target.length }),
          danger: true,
          confirmText: t("futures.reject"),
        });
        if (!ok) return;
        await api.futuresBatchReviewWithdraw(target, "reject");
        load();
      },
    },
  ];
  const onRun = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("futures.withdrawReview")}</h3>
        <div className="card-actions">
          <button className="btn" onClick={load}>{t("common.refresh")}</button>
        </div>
      </div>
      <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && rows === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && rows !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>{t("futures.col.id")}</th>
                <th>{t("futures.col.asset")}</th>
                <th>{t("futures.col.amount")}</th>
                <th>{t("futures.col.address")}</th>
                <th>{t("futures.col.status")}</th>
                <th>{t("futures.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t("futures.emptyWithdraw")}</td></tr>}
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                  </td>
                  <td>{w.id}</td>
                  <td>{w.asset}</td>
                  <td>{w.amount}</td>
                  <td className="mono cell-clamp">{w.address}</td>
                  <td>{w.status}</td>
                  <td className="row-actions">
                    <button className="link-btn" disabled={w.status !== "pending"} onClick={() => review(w, "approve")}>{t("futures.approve")}</button>
                    <button className="link-btn danger" disabled={w.status !== "pending"} onClick={() => review(w, "reject")}>{t("futures.reject")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PositionLiquidation() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const ids = useMemo(() => (rows ?? []).map((p) => p.id), [rows]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setRows(undefined);
    api.futuresPositions().then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const liq = async (p: any) => {
    if (!(await confirm({ title: t("futures.liq"), message: t("confirm.liquidate", { name: `#${p.id}（${p.symbol}）` }), danger: true, confirmText: t("futures.liq") })))
      return;
    await api.futuresLiquidatePosition(p.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "liquidate",
      label: t("futures.batchLiq"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("futures.batchLiq"),
          message: t("confirm.batchLiquidate", { n: ids.length }),
          danger: true,
          confirmText: t("futures.liq"),
        });
        if (!ok) return;
        await api.futuresBatchLiquidatePosition(ids as number[]);
        load();
      },
    },
  ];
  const onRun = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("futures.positionLiq")}</h3>
        <div className="card-actions">
          <button className="btn" onClick={load}>{t("common.refresh")}</button>
        </div>
      </div>
      <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && rows === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && rows !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>{t("futures.col.id")}</th>
                <th>{t("futures.col.user")}</th>
                <th>{t("futures.col.symbol")}</th>
                <th>{t("futures.col.side")}</th>
                <th>{t("futures.col.qty")}</th>
                <th>{t("futures.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t("futures.emptyPosition")}</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td>{p.id}</td>
                  <td>{p.user_id ?? p.uid}</td>
                  <td>{p.symbol}</td>
                  <td className={p.side === "long" ? "otc-side buy" : "otc-side sell"}>{p.side}</td>
                  <td>{p.qty ?? p.amount}</td>
                  <td className="row-actions">
                    <button className="link-btn danger" onClick={() => liq(p)}>{t("futures.liq")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
