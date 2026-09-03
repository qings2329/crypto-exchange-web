import { useState } from "react";
import { adminApi, type SymbolConfig } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
} from "../../components/admin/AdminUI";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const EMPTY_FORM: Partial<SymbolConfig> = {
  symbol: "",
  base: "",
  quote: "",
  status: "active",
  fee_rate: 0,
  max_leverage: 1,
  min_qty: 0,
};

export default function Symbols() {
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SymbolConfig | null>(null);
  const [form, setForm] = useState<Partial<SymbolConfig>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const { data, loading, err, reload } = useAdminData(
    () => adminApi.symbols({ q: q || undefined }),
    [q]
  );

  const items = data?.items ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (s: SymbolConfig) => {
    setEditing(s);
    setForm({ ...s });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.symbol || !form.base || !form.quote) return;
    setSaving(true);
    try {
      await adminApi.symbolUpsert(form, editing?.symbol);
      setShowModal(false);
      reload();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (s: SymbolConfig) => {
    const next = s.status === "active" ? "halted" : "active";
    const ok = await confirm({
      title: "切换状态",
      message: `确定将 ${s.symbol} 状态切换为 ${next}？`,
      confirmText: "确定",
    });
    if (!ok) return;
    await adminApi.symbolUpsert({ status: next }, s.symbol);
    reload();
  };

  const set = <K extends keyof SymbolConfig>(k: K, v: SymbolConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <AdminHeader
        title="交易对管理"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              刷新
            </Button>
            <Button size="sm" onClick={openCreate}>
              新增交易对
            </Button>
          </>
        }
      />

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          className="input w-48"
          placeholder="搜索交易对"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && !data && <LoadingState />}

      {!loading && items.length === 0 && <EmptyState />}

      {items.length > 0 && (
        <AdminTable columns={["交易对", "基础", "计价", "状态", "手续费", "最大杠杆", "最小数量", "操作"]}>
          <tbody>
            {items.map((s) => (
              <tr key={s.symbol} className="hover:bg-panel-2 transition-colors">
                <td className="whitespace-nowrap px-3 py-2 text-xs font-medium">{s.symbol}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{s.base}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{s.quote}</td>
                <td className="px-3 py-2">
                  <Badge variant={s.status === "active" ? "success" : "danger"}>
                    {s.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
                  {(s.fee_rate * 100).toFixed(2)}%
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
                  {s.max_leverage}x
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{s.min_qty}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      编辑
                    </Button>
                    <Button
                      variant={s.status === "active" ? "sell" : "buy"}
                      size="sm"
                      onClick={() => toggleStatus(s)}
                    >
                      {s.status === "active" ? "停用" : "启用"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {showModal && (
        <Modal
          title={editing ? `编辑 ${editing.symbol}` : "新增交易对"}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="交易对">
              <input
                className="input w-full"
                value={form.symbol ?? ""}
                onChange={(e) => set("symbol", e.target.value)}
                disabled={!!editing}
                placeholder="例: BTCUSDT"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="基础币种">
                <input
                  className="input w-full"
                  value={form.base ?? ""}
                  onChange={(e) => set("base", e.target.value)}
                  placeholder="BTC"
                />
              </Field>
              <Field label="计价币种">
                <input
                  className="input w-full"
                  value={form.quote ?? ""}
                  onChange={(e) => set("quote", e.target.value)}
                  placeholder="USDT"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="状态">
                <select
                  className="input w-full"
                  value={form.status ?? "active"}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="active">active</option>
                  <option value="halted">halted</option>
                </select>
              </Field>
              <Field label="手续费率">
                <input
                  className="input w-full"
                  type="number"
                  step="0.0001"
                  value={form.fee_rate ?? 0}
                  onChange={(e) => set("fee_rate", Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="最大杠杆">
                <input
                  className="input w-full"
                  type="number"
                  min="1"
                  value={form.max_leverage ?? 1}
                  onChange={(e) => set("max_leverage", Number(e.target.value))}
                />
              </Field>
              <Field label="最小数量">
                <input
                  className="input w-full"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.min_qty ?? 0}
                  onChange={(e) => set("min_qty", Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
