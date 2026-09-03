import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  StatCard,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const fmtNum = (n: number) => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
};

const fmtDate = (ts: string) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
};

export default function Risk() {
  const { data, loading, err, reload } = useAdminData(() => adminApi.risk());

  const liquidations = data?.liquidations ?? [];
  const pending = liquidations.length;

  return (
    <div>
      <AdminHeader
        title="风控中心"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            刷新
          </Button>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="保险基金" value={fmtNum(data.insurance_fund)} accent />
            <StatCard label="社会化损失" value={fmtNum(data.socialized_loss)} />
            <StatCard
              label="待处理强平"
              value={fmtNum(pending)}
              sub={`更新于 ${fmtDate(data.updated_at)}`}
            />
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold">强平监控</div>
            {pending === 0 ? (
              <EmptyState text="当前无强平事件" />
            ) : (
              <AdminTable
                columns={["用户 ID", "交易对", "方向", "数量", "强平价", "权益", "检测时间"]}
              >
                {liquidations.map((l, i) => (
                  <tr key={i} className="hover:bg-panel-2/50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{l.user_id}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{l.symbol}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge variant={l.side === "buy" ? "success" : "danger"}>
                        {l.side === "buy" ? "买入" : "卖出"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(l.size)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(l.liq_price)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(l.equity)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                      {fmtDate(l.detected)}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </div>

          {(data.adl_queue.length > 0 || data.notes) && (
            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {data.adl_queue.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-sm font-semibold">ADL 队列</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.adl_queue.map((s) => (
                      <span
                        key={s}
                        className="rounded-md border border-sell/40 bg-sell/5 px-2 py-0.5 text-xs font-medium text-sell tabular-nums"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.notes && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 text-sm font-semibold">备注</div>
                  <p className="text-xs text-muted">{data.notes}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
