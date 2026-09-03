import { useState } from "react";
import { adminApi, type Deposit } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import {
  AdminHeader,
  AdminTable,
  EmptyState,
  LoadingState,
  Pagination,
} from "../../components/admin/AdminUI";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const PAGE = 20;

const STATUS_MAP: Record<string, "success" | "warning" | "danger"> = {
  confirmed: "success",
  pending: "warning",
  failed: "danger",
};

function truncHash(h: string) {
  if (!h) return "—";
  if (h.length <= 16) return h;
  return `${h.slice(0, 8)}...${h.slice(-6)}`;
}

export default function Deposits() {
  const [page, setPage] = useState(1);
  const [coin, setCoin] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [fCoin, setFCoin] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fUserId, setFUserId] = useState("");

  const { data, loading, err, reload } = useAdminData(
    () =>
      adminApi.deposits({
        limit: PAGE,
        offset: (page - 1) * PAGE,
        coin: fCoin || undefined,
        status: fStatus || undefined,
        user_id: fUserId ? Number(fUserId) : undefined,
      }),
    [page, fCoin, fStatus, fUserId]
  );

  const handleSearch = () => {
    setPage(1);
    setFCoin(coin);
    setFStatus(status);
    setFUserId(userId);
  };

  const deposits = data?.deposits ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader
        title="充值记录"
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input w-28"
          placeholder="币种"
          value={coin}
          onChange={(e) => setCoin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <select
          className="input w-28"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="confirmed">confirmed</option>
          <option value="pending">pending</option>
          <option value="failed">failed</option>
        </select>
        <input
          className="input w-28"
          placeholder="用户 ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button size="sm" onClick={handleSearch}>
          搜索
        </Button>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && deposits.length === 0 && <EmptyState />}

      {deposits.length > 0 && (
        <>
          <AdminTable
            columns={["ID", "用户", "币种", "链", "金额", "Tx Hash", "状态", "时间"]}
          >
            <tbody>
              {deposits.map((d: Deposit) => (
                <tr key={d.id} className="hover:bg-panel-2 transition-colors">
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-mono">{d.id}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{d.user_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium">{d.coin}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{d.chain}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums font-medium">
                    {d.amount}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="cursor-pointer font-mono text-xs hover:text-accent select-all"
                      title={d.tx_hash}
                    >
                      {truncHash(d.tx_hash)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_MAP[d.status] === "success" ? "success" : STATUS_MAP[d.status] === "danger" ? "danger" : "secondary"}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                    {d.time ? new Date(d.time).toLocaleString("zh-CN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
          <Pagination page={page} total={total} pageSize={PAGE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
