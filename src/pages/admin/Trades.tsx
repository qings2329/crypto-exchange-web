import { useState, useCallback } from "react";
import { adminApi, type TradeView } from "../../api/admin";
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

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export default function Trades() {
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");
  const [userId, setUserId] = useState("");
  const [qSymbol, setQSymbol] = useState("");
  const [qUserId, setQUserId] = useState("");

  const { data, loading, err, reload } = useAdminData(
    () =>
      adminApi.trades({
        limit: PAGE,
        offset: (page - 1) * PAGE,
        symbol: qSymbol || undefined,
        user_id: qUserId ? Number(qUserId) : undefined,
      }),
    [page, qSymbol, qUserId]
  );

  const handleSearch = useCallback(() => {
    setPage(1);
    setQSymbol(symbol);
    setQUserId(userId);
  }, [symbol, userId]);

  const trades = data?.trades ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader
        title="成交记录"
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
          className="input w-36"
          placeholder="交易对"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <input
          className="input w-36"
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

      {!loading && trades.length === 0 && <EmptyState />}

      {trades.length > 0 && (
        <>
          <AdminTable columns={["市场", "交易对", "方向", "价格", "数量", "Taker", "Maker", "时间"]}>
            <tbody>
              {trades.map((t: TradeView) => (
                <tr key={t.id} className="hover:bg-panel-2 transition-colors">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {t.market}
                    {t.is_margin && (
                      <span className="ml-1 text-[10px] text-muted">
                        {t.leverage ? `${t.leverage}x` : "杠杆"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium">{t.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant={t.taker_side === "buy" ? "success" : "danger"}>
                      {t.taker_side === "buy" ? "买入" : "卖出"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{t.price}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{t.qty}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{t.taker_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{t.maker_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtTime(t.time)}</td>
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
