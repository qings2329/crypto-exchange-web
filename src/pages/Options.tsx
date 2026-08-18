import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/Confirm";
import { useSelection, BatchBar, type BatchAction } from "../components/Batch";
import { useI18n } from "../i18n";

export function Options() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h2>{t("page.options")}</h2>
      <ContractManage />
      <PositionClose />
    </div>
  );
}

function ContractManage() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const load = () => {
    setRows(undefined);
    api.optionContracts().then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const toggle = async (c: any) => {
    const next = c.status === "open" ? "closed" : "open";
    const label = next === "open" ? t("options.list") : t("options.delist");
    if (!(await confirm({ title: label, message: t(next === "open" ? "confirm.toggleOn" : "confirm.toggleOff", { name: `#${c.id}（${c.underlying}/${c.quote}）` }), confirmText: label })))
      return;
    await api.optionSetContractStatus(c.id, next);
    load();
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h3>{t("options.contracts")}</h3>
        <button className="btn" onClick={load}>{t("common.refresh")}</button>
      </div>
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && rows === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && rows !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("options.col.id")}</th>
                <th>{t("options.col.underlying")}</th>
                <th>{t("options.col.quote")}</th>
                <th>{t("options.col.strike")}</th>
                <th>{t("options.col.expiry")}</th>
                <th>{t("options.col.status")}</th>
                <th>{t("options.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t("options.emptyContract")}</td></tr>}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.underlying}</td>
                  <td>{c.quote}</td>
                  <td>{c.strike ?? "—"}</td>
                  <td>{c.expiry}</td>
                  <td>
                    <span className={`perm-badge ${c.status === "open" ? "safe" : "warn"}`}>
                      {c.status === "open" ? t("options.onSale") : t("options.offSale")}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => toggle(c)}>
                      {c.status === "open" ? t("options.delist") : t("options.list")}
                    </button>
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

function PositionClose() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rows, setRows] = useState<any[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const ids = useMemo(() => (rows ?? []).map((p) => p.id), [rows]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setRows(undefined);
    api.optionPositions().then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const close = async (p: any) => {
    if (!(await confirm({ title: t("options.liq"), message: t("confirm.liquidate", { name: `#${p.id}${t("common.userParen", { uid: p.user_id ?? p.uid })}` }), danger: true, confirmText: t("options.liq") })))
      return;
    await api.optionClosePosition(p.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "close",
      label: t("options.batchLiq"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("options.batchLiq"),
          message: t("confirm.batchLiquidate", { n: ids.length }),
          danger: true,
          confirmText: t("options.liq"),
        });
        if (!ok) return;
        await api.optionBatchClosePosition(ids as number[]);
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
        <h3>{t("options.positions")}</h3>
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
                <th>{t("options.col.id")}</th>
                <th>{t("options.col.user")}</th>
                <th>{t("options.col.symbol")}</th>
                <th>{t("options.col.side")}</th>
                <th>{t("options.col.qty")}</th>
                <th>{t("options.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t("options.emptyPosition")}</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td>{p.id}</td>
                  <td>{p.user_id ?? p.uid}</td>
                  <td>{p.contract_id ?? p.symbol}</td>
                  <td className={p.side === "long" || p.side === "call" ? "otc-side buy" : "otc-side sell"}>{p.side}</td>
                  <td>{p.qty ?? p.amount}</td>
                  <td className="row-actions">
                    <button className="link-btn danger" onClick={() => close(p)}>{t("options.liq")}</button>
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
