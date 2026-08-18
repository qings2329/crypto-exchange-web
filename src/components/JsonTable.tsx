// 通用数据渲染：数组渲染为表格（自动取并集表头），对象渲染为键值列表，其余原样展示。
import { useI18n } from "../i18n";
export interface JsonTableProps {
  data: any;
  // 排序状态（由上层 ApiTable 控制）：当前排序列、方向、点击回调。
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  // 批量选择：渲染勾选列（由上层 ApiTable 控制）。
  selectable?: boolean;
  selectedKeys?: Set<string>;
  rowKey?: (row: any, i: number) => string;
  onToggle?: (key: string) => void;
  onToggleAll?: (keys: string[]) => void;
}

export function JsonTable({
  data,
  sortKey,
  sortDir,
  onSort,
  selectable,
  selectedKeys,
  rowKey,
  onToggle,
  onToggleAll,
}: JsonTableProps) {
  const { t } = useI18n();
  if (data === null || data === undefined) return <div className="muted">{t("common.noData")}</div>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <div className="muted">{t("common.noData")}</div>;
    const keys = Array.from(
      data.reduce<Set<string>>((set, row) => {
        if (row && typeof row === "object") Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );
    const sortable = !!onSort;
    const rowKeys = data.map((row, i) => (rowKey ? rowKey(row, i) : String(i)));
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && (
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={rowKeys.length > 0 && rowKeys.every((k) => selectedKeys?.has(k))}
                    onChange={() => onToggleAll?.(rowKeys)}
                  />
                </th>
              )}
              {keys.map((k) => (
                <th
                  key={k}
                  className={sortable ? "sortable" : ""}
                  onClick={sortable ? () => onSort!(k) : undefined}
                >
                  {k}
                  {sortable && sortKey === k && (
                    <span className="sort-ind">{sortDir === "asc" ? " ▲" : " ▼"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {selectable && (
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(rowKeys[i]) ?? false}
                      onChange={() => onToggle?.(rowKeys[i])}
                    />
                  </td>
                )}
                {keys.map((k) => (
                  <td key={k}>{renderCell(row?.[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (typeof data === "object") {
    return (
      <div className="kv">
        {Object.entries(data).map(([k, v]) => (
          <div className="kv-row" key={k}>
            <span className="kv-k">{k}</span>
            <span className="kv-v">{renderCell(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <pre className="raw">{String(data)}</pre>;
}

function renderCell(v: any) {
  if (v === null || v === undefined) return <span className="muted">—</span>;
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "object") return <pre className="cell-json">{JSON.stringify(v)}</pre>;
  return String(v);
}
