import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

/** 管理页标题栏：标题 + 右侧操作区。 */
export function AdminHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/** 空态占位。 */
export function EmptyState({ text }: { text?: string }) {
  const { t } = useI18n();
  return <div className="muted py-12 text-center">{text ?? t("common.noData")}</div>;
}

/** 加载占位。 */
export function LoadingState() {
  const { t } = useI18n();
  return <div className="muted py-12 text-center">{t("common.loading")}</div>;
}

/** 分页工具条。 */
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted">
      <span>
        {t("common.pageInfo", { page, total: pages, count: total })}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t("common.prev")}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

/** 通用状态徽章。 */
export function StatusBadge({
  status,
  map,
}: {
  status: string;
  map?: Record<string, string>;
}) {
  const variant =
    map?.[status] === "danger"
      ? "danger"
      : map?.[status] === "success"
        ? "success"
        : map?.[status] === "warn"
          ? "warning"
          : "secondary";
  return <Badge variant={variant as any}>{status}</Badge>;
}

/** KPI 统计卡片。 */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        accent && "border-accent/30"
      )}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", accent && "text-accent")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** 基础数据表格容器：带 sticky 表头的样式化 table。 */
export function AdminTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-panel-2 text-left text-xs text-muted">
            {columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}
