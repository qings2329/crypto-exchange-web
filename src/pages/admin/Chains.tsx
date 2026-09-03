import { useState, type FormEvent } from "react";
import { adminApi, type Chain } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { Modal } from "../../components/Modal";
import { AdminHeader, AdminTable, EmptyState, LoadingState } from "../../components/admin/AdminUI";
import { useI18n } from "../../i18n";

interface FormState {
  name: string;
  symbol: string;
  confirmations: number;
  rpc_endpoint: string;
}

const EMPTY: FormState = { name: "", symbol: "", confirmations: 0, rpc_endpoint: "" };

export default function Chains() {
  const { t } = useI18n();
  const { data, loading, err, reload } = useAdminData(
    (_) => adminApi.chains({ q: undefined }).then((r) => r as { items: Chain[]; total: number }),
    []
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Chain | null>(null);
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

  const openEdit = (c: Chain) => {
    setEditing(c);
    setForm({
      name: c.name,
      symbol: c.symbol,
      confirmations: c.confirmations,
      rpc_endpoint: c.rpc_endpoint,
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
        await adminApi.chainUpdate(editing.id, form);
      } else {
        await adminApi.chainCreate(form);
      }
      setMsg(editing ? "已更新公链" : "已创建公链");
      setOpen(false);
      reload();
    } catch (e2) {
      setFErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleFlag = async (c: Chain, flag: "deposit_enabled" | "withdraw_enabled") => {
    try {
      await adminApi.chainUpdate(c.id, { [flag]: !c[flag] });
      setMsg(`已${c[flag] ? "停用" : "启用"}${flag === "deposit_enabled" ? "充值" : "提现"}`);
      reload();
    } catch (e2) {
      setMsg((e2 as Error).message);
    }
  };

  return (
    <div>
      <AdminHeader
        title="公链管理"
        actions={
          <button className="btn primary" onClick={openCreate}>
            + 新增公链
          </button>
        }
      />
      {msg && <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">{msg}</div>}
      {err && <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">{err}</div>}
      {loading && !data && <LoadingState />}
      {data && data.items.length === 0 && <EmptyState />}
      {data && data.items.length > 0 && (
        <AdminTable columns={["名称", "符号", "确认数", "充值", "提现", "RPC 端点", "更新时间"]}>
          {data.items.map((c) => (
            <tr key={c.id} className="hover:bg-panel-2/30">
              <td className="px-3 py-2.5 font-semibold">{c.name}</td>
              <td className="px-3 py-2.5">{c.symbol}</td>
              <td className="px-3 py-2.5 tabular-nums">{c.confirmations}</td>
              <td className="px-3 py-2.5">
                <button
                  className={c.deposit_enabled ? "btn success" : "btn outline"}
                  onClick={() => toggleFlag(c, "deposit_enabled")}
                >
                  {c.deposit_enabled ? "开启" : "关闭"}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button
                  className={c.withdraw_enabled ? "btn success" : "btn outline"}
                  onClick={() => toggleFlag(c, "withdraw_enabled")}
                >
                  {c.withdraw_enabled ? "开启" : "关闭"}
                </button>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted">{c.rpc_endpoint}</td>
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
          title={editing ? "编辑公链" : "新增公链"}
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
              名称
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              符号
              <input
                className="form-input"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              确认数
              <input
                className="form-input"
                type="number"
                value={form.confirmations}
                onChange={(e) => setForm({ ...form, confirmations: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs text-muted">
              RPC 端点
              <input
                className="form-input"
                value={form.rpc_endpoint}
                onChange={(e) => setForm({ ...form, rpc_endpoint: e.target.value })}
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
