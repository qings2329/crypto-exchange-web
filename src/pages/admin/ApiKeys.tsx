import { useState } from "react";
import { adminApi, type APIKeyView } from "../../api/admin";
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

const PERMS = ["read", "trade", "withdraw"] as const;

export default function ApiKeys() {
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ key: string; api_key: APIKeyView } | null>(null);
  const [form, setForm] = useState({ user_id: "", label: "", permissions: ["read"] as string[] });
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const { data, loading, err, reload } = useAdminData(
    () => adminApi.apikeys({ q: q || undefined }),
    [q]
  );

  const items = data?.items ?? [];

  const togglePerm = (p: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));
  };

  const handleCreate = async () => {
    if (!form.user_id || !form.label) return;
    setSaving(true);
    try {
      const res = await adminApi.apikeyCreate({
        user_id: Number(form.user_id),
        label: form.label,
        permissions: form.permissions,
      });
      setCreatedKey(res);
      setShowCreate(false);
      reload();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (item: APIKeyView) => {
    const ok = await confirm({
      title: "吊销 API 密钥",
      message: `确定吊销 ${item.prefix}...${item.label}？此操作不可逆。`,
      confirmText: "吊销",
      danger: true,
    });
    if (!ok) return;
    await adminApi.apikeyRevoke(item.id);
    reload();
  };

  return (
    <div>
      <AdminHeader
        title="API 密钥"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm({ user_id: "", label: "", permissions: ["read"] });
                setCreatedKey(null);
                setShowCreate(true);
              }}
            >
              创建 API 密钥
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

      {createdKey && (
        <div className="mb-4 rounded-lg border border-buy/30 bg-buy/5 p-4">
          <div className="mb-2 text-xs font-semibold text-buy">密钥已创建，请妥善保存（仅显示一次）</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-panel px-3 py-2 font-mono text-sm text-foreground select-all">
              {createdKey.key}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(createdKey.key)}
            >
              复制
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          className="input w-48"
          placeholder="搜索用户 / 标签"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && !data && <LoadingState />}

      {!loading && items.length === 0 && <EmptyState />}

      {items.length > 0 && (
        <AdminTable
          columns={["密钥", "用户", "权限", "状态", "创建时间", "最后使用", "操作"]}
        >
          <tbody>
            {items.map((k) => (
              <tr key={k.id} className="hover:bg-panel-2 transition-colors">
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <span className="font-mono font-medium">{k.prefix}</span>
                  <span className="text-muted">...{k.label}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{k.user_id}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {k.permissions.map((p) => (
                      <Badge key={p} variant={p === "withdraw" ? "danger" : "default"}>
                        {p}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={k.status === "active" ? "success" : "danger"}>
                    {k.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                  {k.created_at ? new Date(k.created_at).toLocaleString("zh-CN") : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString("zh-CN") : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {k.status === "active" && (
                    <Button variant="sell" size="sm" onClick={() => handleRevoke(k)}>
                      吊销
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {showCreate && (
        <Modal
          title="创建 API 密钥"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "创建中..." : "创建"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">用户 ID</span>
              <input
                className="input w-full"
                type="number"
                value={form.user_id}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">标签</span>
              <input
                className="input w-full"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="例: 量化策略-01"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs text-muted">权限</span>
              <div className="flex gap-3">
                {PERMS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(p)}
                      onChange={() => togglePerm(p)}
                      className="accent-[var(--accent)]"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
