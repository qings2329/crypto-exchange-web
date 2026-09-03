import { useCallback, useState } from "react";
import { adminApi, type Withdrawal, type PendingWithdrawal } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
  StatusBadge,
} from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/Confirm";

const PAGE_SIZE = 20;

const statusMap: Record<string, string> = {
  approved: "success",
  rejected: "danger",
  pending: "warn",
  completed: "success",
};

function fmtNum(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
}

function fmtDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
}

function truncateAddr(a: string, n = 8) {
  if (!a || a.length <= n * 2) return a;
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };
  return (
    <button
      className="ml-1 text-xs text-accent hover:underline cursor-pointer"
      onClick={copy}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

type Tab = "all" | "pending";

export default function Withdrawals() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("all");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [coinFilter, setCoinFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  const loader = useCallback(
    async () => {
      if (tab === "pending") {
        return adminApi.pendingWithdrawals({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
      }
      return adminApi.withdrawals({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: search || undefined,
        coin: coinFilter || undefined,
        status: statusFilter || undefined,
      });
    },
    [tab, page, search, coinFilter, statusFilter]
  );

  const { data, loading, err, reload } = useAdminData(loader, [tab, page, search, coinFilter, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleApprove = async (w: PendingWithdrawal) => {
    const ok = await confirm({
      title: "审批提现",
      message: `确认通过提现 #${w.id}？币种 ${w.coin}，数量 ${fmtNum(w.amount)}，地址 ${truncateAddr(w.address, 12)}`,
      confirmText: "通过",
    });
    if (!ok) return;
    setActingId(w.id);
    try {
      await adminApi.withdrawalApprove(w.id);
      setMsg(`提现 #${w.id} 已审批通过`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (w: PendingWithdrawal) => {
    const ok = await confirm({
      title: "驳回提现",
      message: `确认驳回提现 #${w.id}？币种 ${w.coin}，数量 ${fmtNum(w.amount)}，地址 ${truncateAddr(w.address, 12)}`,
      danger: true,
      confirmText: "驳回",
    });
    if (!ok) return;
    setActingId(w.id);
    try {
      await adminApi.withdrawalReject(w.id);
      setMsg(`提现 #${w.id} 已驳回`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "操作失败");
    } finally {
      setActingId(null);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setCoinFilter("");
    setStatusFilter("");
  };

  const allData = data as { withdrawals: Withdrawal[]; total: number } | null;
  const pendData = data as { items: PendingWithdrawal[]; total: number } | null;

  return (
    <div>
      <AdminHeader title="提现管理" />

      <div className="mb-3 flex items-center gap-1 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
            tab === "all"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
          onClick={() => switchTab("all")}
        >
          全部提现
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
            tab === "pending"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground"
          }`}
          onClick={() => switchTab("pending")}
        >
          待审核
        </button>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
          {msg}
          <button className="ml-2 underline cursor-pointer" onClick={() => setMsg("")}>
            关闭
          </button>
        </div>
      )}

      {err && (
        <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline cursor-pointer" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {tab === "all" && (
        <div className="mb-3 flex items-center gap-2">
          <input
            className="h-8 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="搜索 ID / 地址…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>
            搜索
          </Button>
          <input
            className="h-8 w-24 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="币种"
            value={coinFilter}
            onChange={(e) => { setCoinFilter(e.target.value.trim()); setPage(1); }}
          />
          <select
            className="h-8 rounded-lg border border-border bg-panel-2 px-2 text-sm text-foreground focus:border-accent focus:outline-none"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="completed">已完成</option>
          </select>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {!loading && tab === "all" && allData && allData.withdrawals.length === 0 && (
        <EmptyState text="暂无提现记录" />
      )}

      {!loading && tab === "pending" && pendData && pendData.items.length === 0 && (
        <EmptyState text="暂无待审核提现" />
      )}

      {tab === "all" && allData && allData.withdrawals.length > 0 && (
        <>
          <AdminTable columns={["ID", "用户ID", "币种", "链", "数量", "地址", "TxHash", "状态", "时间"]}>
            {allData.withdrawals.map((w) => (
              <tr key={w.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">{w.id}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{w.user_id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{w.coin}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{w.chain}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(w.amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted max-w-[200px] truncate">
                  {truncateAddr(w.address, 12)}
                  <CopyBtn text={w.address} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted max-w-[160px] truncate">
                  {w.tx_hash ? truncateAddr(w.tx_hash, 8) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={w.status} map={statusMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(w.time)}</td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={allData.total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {tab === "pending" && pendData && pendData.items.length > 0 && (
        <>
          <AdminTable columns={["ID", "用户ID", "币种", "链", "数量", "地址", "提交时间", "状态", "操作"]}>
            {pendData.items.map((w) => (
              <tr key={w.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">{w.id}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{w.user_id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{w.coin}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{w.chain}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtNum(w.amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted max-w-[200px] truncate">
                  {truncateAddr(w.address, 12)}
                  <CopyBtn text={w.address} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(w.submitted_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={w.status} map={statusMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="buy"
                      size="sm"
                      disabled={actingId === w.id}
                      onClick={() => handleApprove(w)}
                    >
                      审批
                    </Button>
                    <Button
                      variant="sell"
                      size="sm"
                      disabled={actingId === w.id}
                      onClick={() => handleReject(w)}
                    >
                      驳回
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={pendData.total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
