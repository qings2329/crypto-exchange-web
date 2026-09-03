import { useCallback } from "react";
import { adminApi, type ClearedTradeView } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  StatCard,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";

function fmtNum(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
}

function fmtDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
}

function fmtTs(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export default function Ledger() {
  const loader = useCallback(() => adminApi.ledger(), []);
  const { data, loading, err, reload } = useAdminData(loader, []);

  return (
    <div>
      <AdminHeader
        title="账本对账"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            刷新
          </Button>
        }
      />

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline cursor-pointer" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && (
        <>
          <div className="mb-3 rounded-lg border px-3 py-2.5 text-sm font-semibold">
            {data.reconciled ? (
              <span className="text-buy">✓ 已对账 — 无差异</span>
            ) : (
              <span className="text-sell">✗ 存在差异 — 差额 {fmtNum(data.discrepancy)}</span>
            )}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="总资产" value={fmtNum(data.total_assets)} />
            <StatCard label="结算余额" value={fmtNum(data.settlement_balance)} />
            <StatCard
              label="差异"
              value={fmtNum(data.discrepancy)}
              accent={!data.reconciled}
            />
            <StatCard label="总成交笔数" value={fmtNum(data.settlement.total_trades)} />
            <StatCard label="总成交额" value={fmtNum(data.settlement.total_volume)} />
            <StatCard label="总手续费" value={fmtNum(data.settlement.total_commission)} />
          </div>

          {Object.keys(data.settlement.by_symbol).length > 0 && (
            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <div className="mb-2 text-sm font-semibold">按交易对统计</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(data.settlement.by_symbol).map(([sym, vol]) => (
                  <div key={sym} className="rounded-lg border border-border bg-panel-2 px-3 py-2">
                    <div className="text-xs text-muted">{sym}</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums">{fmtNum(vol)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-2 text-sm font-semibold">最近已清算成交</div>
          {data.settlement.recent.length === 0 ? (
            <EmptyState text="暂无成交记录" />
          ) : (
            <AdminTable columns={["ID", "交易对", "价格", "数量", "Taker", "Maker", "方向", "手续费", "时间"]}>
              {data.settlement.recent.map((t: ClearedTradeView) => (
                <tr key={t.id} className="hover:bg-panel-2/50">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">{t.id}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{t.symbol}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(t.price)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(t.qty)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">{t.taker_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">{t.maker_id}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={t.taker_side === "buy" ? "text-buy" : "text-sell"}>
                      {t.taker_side === "buy" ? "买入" : "卖出"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(t.fee)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtTs(t.ts)}</td>
                </tr>
              ))}
            </AdminTable>
          )}

          {data.settlement.notes && (
            <div className="mt-3 rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
              {data.settlement.notes}
            </div>
          )}

          <div className="mt-2 text-xs text-muted">更新时间：{fmtDate(data.updated_at)}</div>
        </>
      )}
    </div>
  );
}
