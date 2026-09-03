import { useState } from "react";
import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const PAGE_SIZE = 20;

export default function Audit() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, err, reload } = useAdminData(
    () =>
      adminApi.auditLogs({
        q: q || undefined,
        keyword: q || undefined,
        action: action || undefined,
        method: method || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    [q, action, method, page]
  );

  return (
    <div>
      <AdminHeader
        title="审计日志"
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            刷新
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索路径 / 详情"
          className="h-8 w-64 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
            reload();
          }}
          className="h-8 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">全部操作</option>
          <option value="create">创建</option>
          <option value="update">更新</option>
          <option value="delete">删除</option>
          <option value="login">登录</option>
          <option value="logout">登出</option>
          <option value="read">读取</option>
        </select>
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
            reload();
          }}
          className="h-8 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">全部方法</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPage(1);
            reload();
          }}
        >
          查询
        </Button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && data.logs.length === 0 && <EmptyState />}

      {data && data.logs.length > 0 && (
        <>
          <AdminTable
            columns={["ID", "管理员", "方法", "路径", "操作", "目标", "状态", "详情", "IP", "时间"]}
          >
            {data.logs.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-panel-2">
                <td className="px-3 py-2.5 tabular-nums text-muted">{l.id}</td>
                <td className="px-3 py-2.5 tabular-nums">{l.admin_id}</td>
                <td className="px-3 py-2.5">
                  <MethodBadge method={l.method} />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 font-mono text-xs">
                  {l.path}
                </td>
                <td className="px-3 py-2.5 text-muted">{l.action || "—"}</td>
                <td className="max-w-[160px] truncate px-3 py-2.5 text-muted">
                  {l.target || "—"}
                </td>
                <td className="px-3 py-2.5">
                  <StatusCode status={l.status} />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted">
                  {l.detail || "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted">{l.ip || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted">
                  {formatTime(l.time)}
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
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const variant =
    method === "GET"
      ? "secondary"
      : method === "POST"
        ? "success"
        : method === "DELETE"
          ? "danger"
          : "default";
  return <Badge variant={variant as any}>{method}</Badge>;
}

function StatusCode({ status }: { status: number }) {
  const ok = status >= 200 && status < 400;
  return (
    <Badge variant={ok ? "success" : "danger"} className="tabular-nums">
      {status}
    </Badge>
  );
}

function formatTime(ts: number) {
  if (ts == null) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
