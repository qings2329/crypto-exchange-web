import { useState } from "react";
import {
  adminApi,
  type PermissionDef,
  type RoleView,
} from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { AdminHeader, EmptyState, LoadingState } from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const fmtDate = (ts: string) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
};

interface RoleForm {
  name: string;
  description: string;
}

const emptyRole: RoleForm = { name: "", description: "" };

export default function Roles() {
  const confirm = useConfirm();
  const { data, loading, err, reload } = useAdminData(() =>
    adminApi.roles({ limit: 200, offset: 0 })
  );
  const [perms, setPerms] = useState<PermissionDef[] | null>(null);
  const [showPerms, setShowPerms] = useState<RoleView | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState<RoleView | "new" | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyRole);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const notify = (m: string) => {
    setMsg(m);
    reload();
  };

  const openPerms = async (r: RoleView) => {
    setShowPerms(r);
    setPermSelected(new Set(r.permissions));
    setMsg("");
    if (!perms) {
      try {
        setPerms(await adminApi.permissions());
      } catch (e) {
        setMsg((e as Error).message || "加载权限失败");
      }
    }
  };

  const openForm = (r: RoleView | "new") => {
    setShowForm(r);
    setForm(r === "new" ? emptyRole : { name: r.name, description: r.description });
    setMsg("");
  };

  const handleSaveForm = async () => {
    if (!showForm) return;
    if (!form.name.trim()) {
      setMsg("请输入角色名");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      if (showForm === "new") {
        await adminApi.roleCreate({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        });
        notify("角色创建成功");
      } else {
        await adminApi.roleUpdate(showForm.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        });
        notify("角色已更新");
      }
      setShowForm(null);
    } catch (e) {
      setMsg((e as Error).message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (r: RoleView) => {
    const ok = await confirm({
      title: "删除角色",
      message: `确认删除角色「${r.name}」（ID ${r.id}）？删除后不可恢复。`,
      danger: true,
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await adminApi.roleDelete(r.id);
      notify(`角色 ${r.name} 已删除`);
    } catch (e) {
      setMsg((e as Error).message || "删除失败");
    }
  };

  const togglePerm = (key: string) => {
    setPermSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!showPerms) return;
    setSubmitting(true);
    setMsg("");
    try {
      await adminApi.roleSetPermissions(showPerms.id, Array.from(permSelected));
      notify(`角色 ${showPerms.name} 的权限已更新`);
      setShowPerms(null);
    } catch (e) {
      setMsg((e as Error).message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const groups: { group: string; items: PermissionDef[] }[] = [];
  for (const p of perms ?? []) {
    const g = groups.find((x) => x.group === p.group);
    if (g) g.items.push(p);
    else groups.push({ group: p.group, items: [p] });
  }

  const roles = data?.items ?? [];

  return (
    <div>
      <AdminHeader
        title="角色权限"
        actions={
          <Button
            size="sm"
            onClick={() => {
              openForm("new");
            }}
          >
            新增角色
          </Button>
        }
      />

      {msg && (
        <div className="mb-3 rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
          {msg}
          <button className="ml-2 underline" onClick={() => setMsg("")}>
            关闭
          </button>
        </div>
      )}

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {!loading && roles.length === 0 && <EmptyState text="暂无角色" />}

      {roles.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-muted">
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">ID</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">角色名</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">描述</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">权限数</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">创建时间</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-panel-2/50">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.id}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{r.description || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.permissions.length}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                    {fmtDate(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openPerms(r)}>
                        设置权限
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openForm(r)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal
          title={showForm === "new" ? "新增角色" : `编辑角色 - ${showForm.name}`}
          onClose={() => setShowForm(null)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowForm(null)}>
                取消
              </Button>
              <Button size="sm" disabled={submitting} onClick={handleSaveForm}>
                {submitting ? "提交中…" : "保存"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              角色名
              <input
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              描述
              <textarea
                className="min-h-20 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {showPerms && (
        <Modal
          title={`设置权限 - ${showPerms.name}`}
          onClose={() => setShowPerms(null)}
          width={560}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowPerms(null)}>
                取消
              </Button>
              <Button size="sm" disabled={submitting} onClick={handleSavePerms}>
                {submitting ? "提交中…" : "保存"}
              </Button>
            </>
          }
        >
          {!perms || perms.length === 0 ? (
            <div className="muted py-6 text-center">暂无权限定义</div>
          ) : (
            <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.group}>
                  <div className="mb-2 text-xs font-semibold text-muted">{g.group}</div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {g.items.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-sm hover:border-accent/40"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#fcd535]"
                          checked={permSelected.has(p.key)}
                          onChange={() => togglePerm(p.key)}
                        />
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-auto text-xs text-muted">{p.key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
