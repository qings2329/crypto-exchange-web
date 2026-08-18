import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { JsonTable } from "./JsonTable";
import { useSelection, BatchBar, type BatchAction } from "./Batch";
import { useI18n } from "../i18n";

// 拉取一个 GET 端点并以 JsonTable 展示；reloadKey 变化即重新拉取。
// 可选能力：searchable（客户端关键字筛选）、pageSize（分页）、sortable（点击表头排序）、
// selectable + batchActions（批量选择 + 批量操作）。
export function ApiTable({
  title,
  endpoint,
  reloadKey,
  empty,
  searchable = false,
  pageSize,
  sortable = false,
  selectable = false,
  rowId = "id",
  batchActions,
  onChanged,
}: {
  title: string;
  endpoint: string;
  reloadKey?: unknown;
  empty?: string;
  searchable?: boolean;
  pageSize?: number;
  sortable?: boolean;
  selectable?: boolean;
  rowId?: string;
  batchActions?: BatchAction[];
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<any>(undefined);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    let alive = true;
    setData(undefined);
    setErr("");
    api
      .get(endpoint)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [endpoint, reloadKey]);

  const onSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const view = useMemo(() => {
    if (data === undefined || data === null) return data;
    if (!Array.isArray(data)) return data;

    let rows = data;
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        Object.values(r ?? {}).some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = (a ?? {})[sortKey];
        const bv = (b ?? {})[sortKey];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      });
    }
    return rows;
  }, [data, query, sortKey, sortDir]);

  // 分页仅在传入 pageSize 且数据为数组时生效。
  const total = Array.isArray(view) ? view.length : 0;
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = pageSize ? view.slice(safePage * pageSize, safePage * pageSize + pageSize) : view;

  // 批量选择：以 rowId 作为行键，跨分页保留选中状态。
  const allIds = useMemo(
    () => (Array.isArray(view) ? view.map((r) => String((r ?? {})[rowId] ?? "")) : []),
    [view, rowId]
  );
  const { selected, toggle, toggleAll, clear } = useSelection<string>(allIds);
  const [busy, setBusy] = useState(false);
  const runBatch = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
      clear();
      onChanged?.();
    } catch {
      // 动作自行处理错误，或用户取消（约定：取消时抛出来保留选中态）
    } finally {
      setBusy(false);
    }
  };

  // 将当前筛选/排序后的全部行导出为 CSV（含 BOM 以兼容 Excel 中文）。
  const exportCsv = () => {
    if (!Array.isArray(view) || view.length === 0) return;
    const keys = Array.from(
      view.reduce<Set<string>>((set, row) => {
        if (row && typeof row === "object") Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );
    const esc = (v: any) => {
      const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      keys.join(","),
      ...view.map((r) => keys.map((k) => esc((r ?? {})[k])).join(",")),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="panel-tools">
          {searchable && (
            <input
              className="form-input table-search"
              placeholder={t("common.search")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          )}
          {Array.isArray(view) && view.length > 0 && (
            <button className="btn" onClick={exportCsv}>{t("common.exportCsv")}</button>
          )}
        </div>
      </div>
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && data === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && data !== undefined && (
        <>
          {selectable && batchActions && (
            <BatchBar
              ids={[...selected]}
              actions={batchActions}
              onClear={clear}
              busy={busy}
              onRun={runBatch}
            />
          )}
          <JsonTable
            data={pageSize ? pageRows : view}
            sortKey={sortable ? sortKey : undefined}
            sortDir={sortDir}
            onSort={sortable ? onSort : undefined}
            selectable={selectable}
            selectedKeys={selected}
            rowKey={(row) => String((row ?? {})[rowId] ?? "")}
            onToggle={toggle}
            onToggleAll={() => toggleAll()}
          />
          {Array.isArray(view) && view.length === 0 && (
            <div className="muted">{query ? t("common.noMatch") : empty ?? t("common.noData")}</div>
          )}
          {pageSize && pageCount > 1 && (
            <div className="pager">
              <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                {t("common.prev")}
              </button>
              <span className="muted">
                {t("common.pageInfo", { page: safePage + 1, total: pageCount, count: total })}
              </span>
              <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                {t("common.next")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
