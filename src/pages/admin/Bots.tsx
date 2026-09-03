import { useState } from "react";
import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { AdminHeader, EmptyState, LoadingState } from "../../components/admin/AdminUI";

function RenderStrategies({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) return <EmptyState />;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((s, i) => (
        <StrategyCard key={s.id ?? i} s={s} />
      ))}
    </div>
  );
}

function StrategyCard({ s }: { s: any }) {
  const [tickBusy, setTickBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const tick = async () => {
    setTickBusy(true);
    setMsg("");
    try {
      const r = await adminApi.botTick(s.id ?? s.strategy_id);
      setMsg(r?.message ?? "Tick 已执行");
    } catch (e2) {
      setMsg((e2 as Error).message);
    } finally {
      setTickBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{s.name ?? s.id ?? "策略"}</span>
        <span className="rounded-md bg-tag-bg px-2 py-0.5 text-xs text-accent">
          {s.status ?? s.state ?? "—"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
        {s.type && (
          <div>
            类型：<span className="text-foreground">{s.type}</span>
          </div>
        )}
        {s.symbol && (
          <div>
            交易对：<span className="font-mono text-foreground">{s.symbol}</span>
          </div>
        )}
        {s.total ?? s.sum_orders ? (
          <div>
            累计订单：<span className="tabular-nums text-foreground">{s.total ?? s.sum_orders}</span>
          </div>
        ) : null}
        {s.profit ? (
          <div className={Number(s.profit) >= 0 ? "text-buy" : "text-sell"}>
            收益：{String(s.profit)}
          </div>
        ) : null}
      </div>
      {msg && <div className="mt-2 text-xs text-accent">{msg}</div>}
      <button className="btn outline mt-3 w-full" onClick={tick} disabled={tickBusy}>
        {tickBusy ? "执行中…" : "执行一次 (Tick)"}
      </button>
    </div>
  );
}

export default function Bots() {
  const { data, loading, err, reload } = useAdminData(() => adminApi.botStrategies(), []);

  return (
    <div>
      <AdminHeader
        title="交易机器人策略"
        actions={
          <button className="btn outline" onClick={() => reload()}>
            刷新
          </button>
        }
      />
      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">{err}</div>
      )}
      {loading && !data && <LoadingState />}
      {data && <RenderStrategies rows={data.strategies ?? []} />}
    </div>
  );
}
