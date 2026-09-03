import { useCallback, useState } from "react";
import { adminApi, type AdminUser } from "../../api/admin";
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
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const PAGE_SIZE = 20;

const statusMap: Record<string, string> = {
  active: "success",
  frozen: "danger",
};

const kycMap: Record<string, string> = {
  verified: "success",
  reviewing: "warn",
  rejected: "danger",
};

function fmtNum(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
}

function fmtDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
}

interface CreateForm {
  username: string;
  email: string;
  password: string;
  status: string;
  kyc: string;
}

const emptyForm: CreateForm = {
  username: "",
  email: "",
  password: "",
  status: "active",
  kyc: "unverified",
};

export default function Users() {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const loader = useCallback(
    () =>
      adminApi.users({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: search || undefined,
        status: statusFilter || undefined,
      }),
    [page, search, statusFilter]
  );

  const { data, loading, err, reload } = useAdminData(loader, [page, search, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleFreeze = async (u: AdminUser) => {
    const ok = await confirm({
      title: "冻结用户",
      message: `确认冻结用户「${u.username}」（ID ${u.id}）？冻结后该用户将无法登录。`,
      danger: true,
      confirmText: "冻结",
    });
    if (!ok) return;
    setActingId(u.id);
    try {
      await adminApi.userFreeze(u.id);
      setMsg(`用户 ${u.username} 已冻结`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleUnfreeze = async (u: AdminUser) => {
    const ok = await confirm({
      title: "解冻用户",
      message: `确认解冻用户「${u.username}」（ID ${u.id}）？`,
      confirmText: "解冻",
    });
    if (!ok) return;
    setActingId(u.id);
    try {
      await adminApi.userUnfreeze(u.id);
      setMsg(`用户 ${u.username} 已解冻`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleResetTFA = async (u: AdminUser) => {
    const ok = await confirm({
      title: "重置两步验证",
      message: `确认重置用户「${u.username}」（ID ${u.id}）的两步验证？重置后用户需重新绑定。`,
      danger: true,
      confirmText: "重置",
    });
    if (!ok) return;
    setActingId(u.id);
    try {
      await adminApi.userResetTFA(u.id);
      setMsg(`用户 ${u.username} 的两步验证已重置`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      setMsg("请填写用户名、邮箱和密码");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      await adminApi.userCreate({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        status: form.status,
        kyc: form.kyc,
      });
      setMsg("用户创建成功");
      setShowCreate(false);
      setForm(emptyForm);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader
        title="用户管理"
        actions={
          <Button size="sm" onClick={() => { setShowCreate(true); setMsg(""); }}>
            新增用户
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
          className="h-8 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="搜索用户名 / 邮箱…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="outline" size="sm" onClick={handleSearch}>
          搜索
        </Button>
        <select
          className="h-8 rounded-lg border border-border bg-panel-2 px-2 text-sm text-foreground focus:border-accent focus:outline-none"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="frozen">冻结</option>
        </select>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && data && data.items.length === 0 && <EmptyState text="暂无用户" />}

      {data && data.items.length > 0 && (
        <>
          <AdminTable columns={["ID", "用户名", "邮箱", "状态", "KYC", "等级", "余额", "注册时间", "操作"]}>
            {data.items.map((u) => (
              <tr key={u.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{u.id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{u.username}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{u.email}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={u.status} map={statusMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={u.kyc} map={kycMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{u.level}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(u.balance)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(u.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-1">
                    {u.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === u.id}
                        onClick={() => handleFreeze(u)}
                      >
                        冻结
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === u.id}
                        onClick={() => handleUnfreeze(u)}
                      >
                        解冻
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actingId === u.id}
                      onClick={() => handleResetTFA(u)}
                    >
                      重置TFA
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
          title="新增用户"
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
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              邮箱
              <input
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              密码
              <input
                type="password"
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              状态
              <select
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">正常</option>
                <option value="frozen">冻结</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              KYC
              <select
                className="h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none"
                value={form.kyc}
                onChange={(e) => setForm({ ...form, kyc: e.target.value })}
              >
                <option value="unverified">未认证</option>
                <option value="reviewing">审核中</option>
                <option value="verified">已认证</option>
                <option value="rejected">已拒绝</option>
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
