import { useCallback, useState } from "react";
import { adminApi, type AdminView } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
  StatusBadge,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const PAGE_SIZE = 20;

const statusMap: Record<string, string> = {
  active: "success",
  disabled: "danger",
};

const fmtDate = (ts: string) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
};

interface CreateForm {
  username: string;
  password: string;
  role_name: string;
}

const emptyCreate: CreateForm = { username: "", password: "", role_name: "" };

export default function Admins() {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [showReset, setShowReset] = useState<AdminView | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const loader = useCallback(
    () =>
      adminApi.admins({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: search || undefined,
      }),
    [page, search]
  );

  const { data, loading, err, reload } = useAdminData(loader, [page, search]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const notify = (m: string) => {
    setMsg(m);
    reload();
  };

  const handleToggle = async (a: AdminView) => {
    const isDisable = a.status === "active";
    const ok = await confirm({
      title: isDisable ? "禁用管理员" : "启用管理员",
      message: `确认${isDisable ? "禁用" : "启用"}管理员「${a.username}」（ID ${a.id}）？`,
      danger: isDisable,
      confirmText: isDisable ? "禁用" : "启用",
    });
    if (!ok) return;
    setActingId(a.id);
    try {
      if (isDisable) {
        await adminApi.adminDisable(a.id);
        notify(`管理员 ${a.username} 已禁用`);
      } else {
        await adminApi.adminActivate(a.id);
        notify(`管理员 ${a.username} 已启用`);
      }
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.password.trim() || !createForm.role_name.trim()) {
      setMsg("请填写用户名、密码和角色名");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      await adminApi.adminCreate({
        username: createForm.username.trim(),
        password: createForm.password.trim(),
        role_name: createForm.role_name.trim(),
      });
      notify("管理员创建成功");
      setShowCreate(false);
      setCreateForm(emptyCreate);
    } catch (e) {
      setMsg((e as Error).message || "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!showReset) return;
    if (!newPassword || newPassword.length < 6) {
      setMsg("新密码至少 6 位");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      await adminApi.adminResetPassword(showReset.id, newPassword);
      notify(`管理员 ${showReset.username} 的密码已重置`);
      setShowReset(null);
      setNewPassword("");
    } catch (e) {
      setMsg((e as Error).message || "重置失败");
    } finally {
      setSubmitting(false);
    }
  };

  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader
        title="管理员账户"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setMsg("");
            }}
          >
            新增管理员
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

      <div className="mb-3 flex items-center gap-2">
        <input
          className="h-8 w-56 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="搜索用户名…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="outline" size="sm" onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && data && data.items.length === 0 && <EmptyState text="暂无管理员" />}

      {data && data.items.length > 0 && (
        <>
          <AdminTable
            columns={["ID", "用户名", "角色", "状态", "2FA", "创建时间", "操作"]}
          >
            {data.items.map((a) => (
              <tr key={a.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{a.id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{a.username}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Badge variant="default">{a.role_name}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={a.status} map={statusMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {a.totp_enabled ? (
                    <span className="text-xs text-buy">已启用</span>
                  ) : (
                    <span className="text-xs text-muted">未启用</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                  {fmtDate(a.created_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-1">
                    {a.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === a.id}
                        onClick={() => handleToggle(a)}
                      >
                        禁用
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === a.id}
                        onClick={() => handleToggle(a)}
                      >
                        启用
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowReset(a);
                        setNewPassword("");
                        setMsg("");
                      }}
                    >
                      重置密码
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {showCreate && (
        <Modal
          title="新增管理员"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                取消
              </Button>
              <Button size="sm" disabled={submitting} onClick={handleCreate}>
                {submitting ? "提交中…" : "创建"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              用户名
              <input
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              密码
              <input
                type="password"
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              角色名
              <input
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={createForm.role_name}
                onChange={(e) => setCreateForm({ ...createForm, role_name: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {showReset && (
        <Modal
          title={`重置密码 - ${showReset.username}`}
          onClose={() => setShowReset(null)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowReset(null)}>
                取消
              </Button>
              <Button size="sm" disabled={submitting} onClick={handleResetPassword}>
                {submitting ? "提交中…" : "重置"}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            新密码（至少 6 位）
            <input
              type="password"
              className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
