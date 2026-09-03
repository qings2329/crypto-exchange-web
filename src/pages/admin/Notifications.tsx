import { useState, type FormEvent } from "react";
import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
  StatusBadge,
} from "../../components/admin/AdminUI";
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";
import { Button } from "../../components/ui/button";

const PAGE_SIZE = 20;

const LEVEL_LABEL: Record<string, string> = {
  info: "普通",
  warning: "警告",
  important: "重要",
};

export default function Notifications() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const confirm = useConfirm();

  const { data, loading, err, reload } = useAdminData(
    () =>
      adminApi.notifications({
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    [q, page]
  );

  const [sending, setSending] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    reload();
  };

  const onDelete = async (id: number) => {
    const ok = await confirm({
      title: "删除通知",
      message: "确定删除该通知吗？",
      danger: true,
      confirmText: "删除",
    });
    if (!ok) return;
    await adminApi.notificationDelete(id);
    reload();
  };

  return (
    <div>
      <AdminHeader
        title="通知管理"
        actions={<Button onClick={() => setSending(true)}>发送通知</Button>}
      />

      <form onSubmit={search} className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索通知标题"
          className="h-8 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
        />
        <Button size="sm" variant="outline">
          搜索
        </Button>
      </form>

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && data.items.length === 0 && <EmptyState />}

      {data && data.items.length > 0 && (
        <>
          <AdminTable columns={["ID", "标题", "级别", "来源", "创建时间", "操作"]}>
            {data.items.map((n) => (
              <tr key={n.id} className="transition-colors hover:bg-panel-2">
                <td className="px-3 py-2.5 tabular-nums text-muted">{n.id}</td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <div className="truncate font-semibold">{n.title}</div>
                  <div className="truncate text-xs text-muted">{n.body}</div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge
                    status={LEVEL_LABEL[n.level] ?? n.level}
                    map={{ 普通: "secondary", 警告: "warn", 重要: "danger" }}
                  />
                </td>
                <td className="px-3 py-2.5 text-muted">{n.source ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums text-muted">
                  {formatDate(n.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <Button size="sm" variant="sell" onClick={() => onDelete(n.id)}>
                    删除
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>

          <Pagination
            page={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </>
      )}

      {sending && (
        <SendModal
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SendModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("info");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      setErr("标题和内容不能为空");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      await adminApi.notificationCreate({ title: title.trim(), body: body.trim(), level });
      onSent();
    } catch (e) {
      setErr((e as Error).message || "发送失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="发送通知"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "发送中…" : "发送"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-muted">级别</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
          >
            <option value="info">普通</option>
            <option value="warning">警告</option>
            <option value="important">重要</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted">标题</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted">内容</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        {err && <div className="text-xs text-sell">{err}</div>}
      </div>
    </Modal>
  );
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
