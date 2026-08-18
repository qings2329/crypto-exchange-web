import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/Confirm";
import { useSelection, BatchBar, type BatchAction } from "../components/Batch";
import { Modal } from "../components/Modal";
import { TextField, TextAreaField } from "../components/Form";
import { ApiTable } from "../components/ApiTable";
import { useI18n } from "../i18n";

export function Margin() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h2>{t("page.margin")}</h2>
      <AccountList />
      <ApiTable title={t("margin.liqPrice")} endpoint="/api/v1/margin/liq-price" />
    </div>
  );
}

function AccountList() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[] | undefined>(undefined);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const ids = useMemo(() => (rows ?? []).map((a) => a.id), [rows]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setRows(undefined);
    api.marginAccounts().then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const liq = async (a: any) => {
    if (!(await confirm({ title: t("margin.liq"), message: t("confirm.liquidate", { name: `#${a.id}${t("common.userParen", { uid: a.user_id ?? a.uid })}` }), danger: true, confirmText: t("margin.liq") })))
      return;
    await api.marginLiquidate(a.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "liquidate",
      label: t("margin.batchLiq"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("margin.batchLiq"),
          message: t("confirm.batchLiquidate", { n: ids.length }),
          danger: true,
          confirmText: t("margin.liq"),
        });
        if (!ok) return;
        await api.marginBatchLiquidate(ids as number[]);
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
      <div className="panel-head">
        <h3>{t("margin.accounts")}</h3>
        <button className="btn" onClick={load}>{t("common.refresh")}</button>
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
                <th>{t("margin.col.id")}</th>
                <th>{t("margin.col.user")}</th>
                <th>{t("margin.col.asset")}</th>
                <th>{t("margin.col.balance")}</th>
                <th>{t("margin.col.debt")}</th>
                <th>{t("margin.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t("margin.empty")}</td></tr>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                  </td>
                  <td>{a.id}</td>
                  <td>{a.user_id ?? a.uid}</td>
                  <td>{a.asset}</td>
                  <td>{a.balance}</td>
                  <td>{a.debt ?? a.liability ?? "—"}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => setEditing(a)}>{t("margin.adjust")}</button>
                    <button className="link-btn danger" onClick={() => liq(a)}>{t("margin.liq")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <AdjustModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </section>
  );
}

function AdjustModal({ account, onClose, onSaved }: { account: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const d = Number(delta);
    if (!delta || Number.isNaN(d) || d === 0) {
      setErr(t("margin.err.delta"));
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.marginAdjustAccount(account.id, d, reason.trim() || undefined);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("margin.adjustTitle", { id: account.id })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>{t("common.cancel")}</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? t("common.saving") : t("margin.adjustSubmit")}
          </button>
        </>
      }
    >
      <p className="muted">{t("margin.adjustHint")}</p>
      <TextField id="m-delta" label={t("margin.adjustAmount")} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder={t("margin.ph.delta")} />
      <TextAreaField id="m-reason" label={t("margin.adjustReason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("margin.ph.reason")} />
      {err && <div className="form-error">{err}</div>}
    </Modal>
  );
}
