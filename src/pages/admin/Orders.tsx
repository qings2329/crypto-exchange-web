import { useCallback, useState } from "react";
import { adminApi, type OrderView } from "../../api/admin";
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
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const PAGE_SIZE = 20;

const orderStatusMap: Record<string, string> = {
  open: "success",
  filled: "default",
  partial: "warn",
  canceled: "danger",
  closed: "secondary",
};

function fmtDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export default function Orders() {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [userIdSearch, setUserIdSearch] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detailOrder, setDetailOrder] = useState<OrderView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const loader = useCallback(
    () =>
      adminApi.orders({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        user_id: userIdSearch ? Number(userIdSearch) : undefined,
        status: statusFilter || undefined,
      }),
    [page, userIdSearch, statusFilter]
  );

  const { data, loading, err, reload } = useAdminData(loader, [page, userIdSearch, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    setUserIdSearch(userIdInput.trim());
  };

  const handleDetail = async (o: OrderView) => {
    setDetailLoading(true);
    setDetailErr("");
    setDetailOrder(o);
    try {
      const res = await adminApi.orderDetail(o.id);
      setDetailOrder(res.order);
    } catch (e) {
      setDetailErr((e as Error).message || "加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCancel = async (o: OrderView) => {
    const ok = await confirm({
      title: "撤单",
      message: `确认撤销订单 #${o.id}（${o.symbol}）？`,
      danger: true,
      confirmText: "撤单",
    });
    if (!ok) return;
    setCancellingId(o.id);
    setMsg("");
    try {
      await adminApi.orderCancel(o.id, o.symbol);
      setMsg(`订单 #${o.id} 已撤销`);
      reload();
    } catch (e) {
      setMsg((e as Error).message || "撤单失败");
    } finally {
      setCancellingId(null);
    }
  };

  const total = data?.total ?? 0;

  return (
    <div>
      <AdminHeader title="订单管理" />

      {msg && (
        <div className="mb-3 rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
          {msg}
          <button className="ml-2 underline" onClick={() => setMsg("")}>
            关闭
          </button>
        </div>
      )}

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
          className="h-8 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="用户ID"
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="outline" size="sm" onClick={handleSearch}>
          搜索
        </Button>
        <select
          className="h-8 rounded-lg border border-border bg-panel-2 px-2 text-sm text-foreground focus:border-accent focus:outline-none"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">全部状态</option>
          <option value="open">挂单中</option>
          <option value="closed">已成交</option>
          <option value="canceled">已撤销</option>
        </select>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && data && data.orders.length === 0 && <EmptyState text="暂无订单" />}

      {data && data.orders.length > 0 && (
        <>
          <AdminTable columns={["ID", "用户ID", "交易对", "市场", "方向", "价格", "数量", "已成交", "状态", "时间", "操作"]}>
            {data.orders.map((o) => (
              <tr key={o.id} className="hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{o.id}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{o.user_id}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{o.symbol}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {o.market}
                  {o.is_margin && (
                    <span className="ml-1 text-xs text-accent">×{o.leverage ?? 1}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={o.side === "buy" ? "text-buy font-semibold" : "text-sell font-semibold"}>
                    {o.side === "buy" ? "买入" : "卖出"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{o.price}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{o.qty}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{o.filled}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusBadge status={o.status} map={orderStatusMap} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(o.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleDetail(o)}>
                      查看
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={o.status !== "open" || cancellingId === o.id}
                      onClick={() => handleCancel(o)}
                    >
                      撤单
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {detailOrder && (
        <Modal
          title={`订单详情 #${detailOrder.id}`}
          onClose={() => setDetailOrder(null)}
          width={520}
          footer={
            <Button variant="outline" size="sm" onClick={() => setDetailOrder(null)}>
              关闭
            </Button>
          }
        >
          {detailLoading ? (
            <div className="py-6 text-center text-sm text-muted">加载中…</div>
          ) : detailErr ? (
            <div className="py-6 text-center text-sm text-sell">{detailErr}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailRow label="订单ID" value={String(detailOrder.id)} />
              <DetailRow label="用户ID" value={String(detailOrder.user_id)} />
              <DetailRow label="交易对" value={detailOrder.symbol} />
              <DetailRow label="市场" value={detailOrder.market + (detailOrder.is_margin ? ` (杠杆 ×${detailOrder.leverage ?? 1})` : "")} />
              <DetailRow
                label="方向"
                value={detailOrder.side === "buy" ? "买入" : "卖出"}
                className={detailOrder.side === "buy" ? "text-buy" : "text-sell"}
              />
              <DetailRow label="状态" value={detailOrder.status} />
              <DetailRow label="价格" value={detailOrder.price} mono />
              <DetailRow label="数量" value={detailOrder.qty} mono />
              <DetailRow label="已成交" value={detailOrder.filled} mono />
              <DetailRow label="创建时间" value={fmtDate(detailOrder.created_at)} />
              <DetailRow label="更新时间" value={fmtDate(detailOrder.updated_at)} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`${mono ? "tabular-nums" : ""} ${className ?? ""}`.trim()}>
        {value}
      </span>
    </div>
  );
}
