import { useState, type FormEvent } from "react";
import { adminApi, type Announcement } from "../../api/admin";
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

const levelLabel = (l: string) =>
  l === "important" ? "重要" : l === "warning" ? "警告" : "普通";

export default function Announcements() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const confirm = useConfirm();

  const { data, loading, err, reload } = useAdminData(
    ({ reload: isReload }) =>
      adminApi.announcements({
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(isReload ? {} : {}),
      }),
    [q, page]
  );

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    reload();
  };

  const onToggle = async (a: Announcement) => {
    await adminApi.announcementUpdate(a.id, { active: !a.active });
    reload();
  };

  const onDelete = async (a: Announcement) => {
    const ok = await confirm({
      title: "删除公告",
      message: `确定删除公告「${a.title}」吗？此操作不可撤销。`,
      danger: true,
      confirmText: "删除",
    });
    if (!ok) return;
    await adminApi.announcementDelete(a.id);
    reload();
  };

  return (
    <div>
      <AdminHeader
        title="公告管理"
        actions={
          <Button onClick={() => setCreating(true)}>发布公告</Button>
        }
      />

      <form onSubmit={search} className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索公告标题"
          className="h-8 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
        />
        <Button size="sm" variant="outline" onClick={() => setPage(1)}>
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

      {data && data.announcements.length === 0 && <EmptyState />}

      {data && data.announcements.length > 0 && (
        <>
          <AdminTable
            columns={["ID", "标题", "级别", "状态", "发布时间", "操作"]}
          >
            {data.announcements.map((a) => (
              <tr
                key={a.id}
                className="transition-colors hover:bg-panel-2"
              >
                <td className="px-3 py-2.5 tabular-nums text-muted">{a.id}</td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <div className="truncate font-semibold">{a.title}</div>
                  <div className="truncate text-xs text-muted">{a.content}</div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={levelLabel(a.level)} map={{ 普通: "secondary", 警告: "warn", 重要: "danger" }} />
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onToggle(a)}
                    className={`inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                      a.active ? "justify-end bg-buy" : "justify-start bg-panel-2"
                    }`}
                    aria-label={a.active ? "下架" : "上架"}
                  >
                    <span className="h-4 w-4 rounded-full bg-white" />
                  </button>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted">
                  {formatDate(a.published_at)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="sell" onClick={() => onDelete(a)}>
                      删除
                    </Button>
                  </div>
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

      {creating && (
        <AnnouncementModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {editing && (
        <AnnouncementModal
          announcement={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function AnnouncementModal({
  announcement,
  onClose,
  onSaved,
}: {
  announcement?: Announcement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [level, setLevel] = useState(announcement?.level ?? "info");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [active, setActive] = useState(announcement?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      setErr("标题和内容不能为空");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const body = { title: title.trim(), level, content: content.trim(), active };
      if (announcement) {
        await adminApi.announcementUpdate(announcement.id, body);
      } else {
        await adminApi.announcementCreate(body);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={announcement ? "编辑公告" : "发布公告"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted">级别</label>
          <div className="flex items-center gap-1">
            {["info", "warning", "important"].map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  level === l
                    ? "bg-accent text-black"
                    : "bg-panel-2 text-muted hover:text-foreground"
                }`}
              >
                {levelLabel(l)}
              </button>
            ))}
          </div>
        </div>

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
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="accent-[#fcd535]"
          />
          立即生效（上架）
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
