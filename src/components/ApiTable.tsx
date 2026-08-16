import { useEffect, useState } from "react";
import { api } from "../api/client";
import { JsonTable } from "./JsonTable";

// 拉取一个 GET 端点并以 JsonTable 展示；reloadKey 变化即重新拉取。
export function ApiTable({
  title,
  endpoint,
  reloadKey,
  empty,
}: {
  title: string;
  endpoint: string;
  reloadKey?: unknown;
  empty?: string;
}) {
  const [data, setData] = useState<any>(undefined);
  const [err, setErr] = useState("");

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

  return (
    <section className="card">
      <h3>{title}</h3>
      {err && <div className="error">加载失败：{err}</div>}
      {!err && data === undefined && <div className="muted">加载中…</div>}
      {!err && data !== undefined && <JsonTable data={data} />}
      {!err && data !== undefined && empty && <div className="muted">{empty}</div>}
    </section>
  );
}
