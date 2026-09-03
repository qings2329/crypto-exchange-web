import { useState, type FormEvent } from "react";
import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { Modal } from "../../components/Modal";
import { AdminHeader, EmptyState, LoadingState } from "../../components/admin/AdminUI";
import { useI18n } from "../../i18n";

function RenderRows({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) return <EmptyState />;
  if (rows.length === 0 || typeof rows[0] !== "object") {
    return (
      <ul className="divide-y divide-border/60">
        {rows.map((r, i) => (
          <li key={i} className="px-3 py-2 text-sm">
            {String(r ?? "")}
          </li>
        ))}
      </ul>
    );
  }
  const keys = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-panel-2 text-left text-xs text-muted">
            {keys.map((k) => (
              <th key={k} className="px-3 py-2.5 font-semibold capitalize">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-panel-2/30">
              {keys.map((k) => (
                <td key={k} className="px-3 py-2.5 tabular-nums">
                  {format(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function format(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function Lending() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"pools" | "lends" | "borrows">("pools");

  const pools = useAdminData(() => adminApi.lendingPools(), [tab]);
  const lends = useAdminData(() => adminApi.lendingLends(), [tab]);
  const borrows = useAdminData(() => adminApi.lendingBorrows(), [tab]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [asset, setAsset] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const createPool = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi.lendingPoolsCreate({ name, asset });
      setMsg("资金池创建成功");
      setOpen(false);
      setName("");
      setAsset("");
      pools.reload();
    } catch (e2) {
      setMsg((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const active = tab === "pools" ? pools : tab === "lends" ? lends : borrows;

  return (
    <div>
      <AdminHeader
        title="借贷管理"
        actions={
          <button className="btn primary" onClick={() => setOpen(true)}>
            + 新建资金池
          </button>
        }
      />
      {msg && <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">{msg}</div>}
      {active.err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {active.err}
        </div>
      )}

      <div className="mb-4 inline-flex gap-1 rounded-lg bg-panel p-1">
        {(
          [
            ["pools", "资金池"],
            ["lends", "出借记录"],
            ["borrows", "借入记录"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              tab === k ? "bg-accent text-black" : "text-muted hover:text-foreground"
            }`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {active.loading && !active.data && <LoadingState />}
      {active.data && (
        <RenderRows
          rows={
            (active.data as { pools?: any[] }).pools ??
            (active.data as { lends?: any[] }).lends ??
            (active.data as { borrows?: any[] }).borrows ??
            []
          }
        />
      )}

      {open && (
        <Modal
          title="新建资金池"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" onClick={createPool} disabled={busy}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <form onSubmit={createPool} className="flex flex-col gap-3">
            <label className="text-xs text-muted">
              名称
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-xs text-muted">
              资产
              <input
                className="form-input"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
