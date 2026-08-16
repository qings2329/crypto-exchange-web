// 通用数据渲染：数组渲染为表格（自动取并集表头），对象渲染为键值列表，其余原样展示。
export function JsonTable({ data }: { data: any }) {
  if (data === null || data === undefined) return <div className="muted">无数据</div>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <div className="muted">无数据</div>;
    const keys = Array.from(
      data.reduce<Set<string>>((set, row) => {
        if (row && typeof row === "object") Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
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
