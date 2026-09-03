import { useState, type FormEvent } from "react";
import { adminApi, type Coin } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { Modal } from "../../components/Modal";
import { AdminHeader, AdminTable, EmptyState, LoadingState } from "../../components/admin/AdminUI";
import { useI18n } from "../../i18n";

interface FormState {
  symbol: string;
  name: string;
  chain: string;
  precision: number;
  withdraw_fee: number;
}

const EMPTY: FormState = { symbol: "", name: "", chain: "", precision: 8, withdraw_fee: 0 };

export default function Coins() {
  const { t } = useI18n();
  const { data, loading, err, reload } = useAdminData(
    (_) => adminApi.coins({ q: undefined }).then((r) => r as { items: Coin[]; total: number }),
    []
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coin | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState("");
  const [fErr, setFErr] = useState("");
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFErr("");
    setOpen(true);
  };

  const openEdit = (c: Coin) => {
    setEditing(c);
    setForm({
      symbol: c.symbol,
      name: c.name,
      chain: c.chain,
      precision: c.precision,
      withdraw_fee: c.withdraw_fee,
    });
    setFErr("");
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFErr("");
    setBusy(true);
    try {
      if (editing) {
        await adminApi.coinUpdate(editing.id, form);
      } else {
        await adminApi.coinCreate(form);
      }
      setMsg(editing ? "已更新币种" : "已创建币种");
      setOpen(false);
      reload();
    } catch (e2) {
      setFErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AdminHeader
        title="币种管理"
        actions={
          <button className="btn primary" onClick={openCreate}>
            + 新增币种
          </button>
        }
      />
      {msg && <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">{msg}</div>}
      {err && <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">{err}</div>}
      {loading && !data && <LoadingState />}
      {data && data.items.length === 0 && <EmptyState />}
      {data && data.items.length > 0 && (
        <AdminTable columns={["符号", "名称", "链", "精度", "提现手续费", "更新时间"]}>
          {data.items.map((c) => (
            <tr key={c.id} className="hover:bg-panel-2/30">
              <td className="px-3 py-2.5 font-semibold uppercase">{c.symbol}</td>
              <td className="px-3 py-2.5">{c.name}</td>
              <td className="px-3 py-2.5">{c.chain}</td>
              <td className="px-3 py-2.5 tabular-nums">{c.precision}</td>
              <td className="px-3 py-2.5 tabular-nums">{c.withdraw_fee}</td>
              <td className="px-3 py-2.5 text-muted">
                {c.updated_at}
                <button className="ml-2 underline" onClick={() => openEdit(c)}>
                  编辑
                </button>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {open && (
        <Modal
          title={editing ? "编辑币种" : "新增币种"}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" onClick={submit} disabled={busy}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <form onSubmit={submit} className="flex flex-col gap-3">
            {fErr && <div className="text-xs text-sell">{fErr}</div>}
            <label className="text-xs text-muted">
              符号
              <input
                className="form-input"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              名称
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              链
              <input
                className="form-input"
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              精度
              <input
                className="form-input"
                type="number"
                value={form.precision}
                onChange={(e) => setForm({ ...form, precision: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs text-muted">
              提现手续费
              <input
                className="form-input"
                type="number"
                step="0.0001"
                value={form.withdraw_fee}
                onChange={(e) => setForm({ ...form, withdraw_fee: Number(e.target.value) })}
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
