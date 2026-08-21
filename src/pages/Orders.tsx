// 历史订单页 /orders：当前委托 / 历史委托 / 成交明细。
import { OrderHistory } from "../components/orders/OrderHistory";

export function Orders() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4" data-testid="orders-page">
      <h1 className="text-xl font-bold text-slate-100">Orders</h1>
      <OrderHistory />
    </div>
  );
}
