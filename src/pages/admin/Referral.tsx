import { useCallback, useState } from "react";
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

const fmtNum = (n: number) => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
};

const fmtRate = (n: number) => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
};

const fmtDate = (ts: string) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
};

function StatusCell({ status }: { status: number }) {
  if (status === 1) {
    return <Badge variant="success">已支付</Badge>;
  }
  return <Badge variant="danger">待处理</Badge>;
}

export default function Referral() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const loader = useCallback(
    () =>
      adminApi.referralCommissions({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: search || undefined,
      }),
    [page, search]
  );

  const { data, loading, err, reload } = useAdminData(loader, [page, search]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const commissions = data?.commissions ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader
        title="邀请返佣"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            刷新
          </Button>
        }
      />

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          className="h-8 w-56 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="搜索邀请人 / 被邀请人…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="outline" size="sm" onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && commissions.length === 0 && <EmptyState text="暂无返佣记录" />}

      {commissions.length > 0 && (
        <>
          <AdminTable
            columns={["ID", "邀请人", "被邀请人", "币种", "金额", "返佣比例", "状态", "创建时间"]}
          >
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.id}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.referrer_id}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.taker_id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{c.asset}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(c.amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">
                  {fmtRate(c.rate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusCell status={c.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                  {fmtDate(c.created_at)}
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
