// 模拟订单状态（Zustand）：当前委托 + 历史订单。
// - 限价单进入 open，行情最新价穿越限价时自动撮合（fillMatching）；
// - 市价单下单即 filled；
// - 撤单转 canceled；全部记录保留在历史中（新单前插）。

import { create } from "zustand";

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "filled" | "canceled";

export interface TradeOrder {
  id: string;
  symbol: string; // BTCUSDT
  side: OrderSide;
  type: OrderType;
  price: number; // 限价单=委托价；市价单=成交价
  qty: number;
  total: number; // price * qty
  ts: number; // 创建时间
  status: OrderStatus;
  settledTs?: number; // 成交/撤销时间
  /** 订单归属市场：撤单时决定调用现货/合约服务端端点（本地单必填，服务端水合时由面板标注） */
  market?: "spot" | "perp";
}

interface OrdersState {
  orders: TradeOrder[];
  /** 已本地撤单的真实服务端订单号（轮询对账时过滤，避免已撤单重现） */
  cancelledIds: number[];
  /** 服务端水合：用后端订单替换某交易对的本地镜像（服务端为真相源） */
  hydrate: (symbol: string, orders: TradeOrder[]) => void;
  place: (order: TradeOrder) => void;
  cancel: (id: string) => void;
  fill: (id: string) => void;
  /** 行情驱动：把可成交的 open 单标记为 filled */
  fillMatching: (symbol: string, lastPrice: number) => void;
}

/** 纯函数：给定最新价，返回应被撮合的 open 单 id（买单价>=市价 / 卖单价<=市价）。 */
export function findFillable(open: TradeOrder[], symbol: string, lastPrice: number): string[] {
  if (!(lastPrice > 0)) return [];
  return open
    .filter(
      (o) =>
        o.symbol === symbol &&
        o.status === "open" &&
        o.type === "limit" &&
        (o.side === "buy" ? o.price >= lastPrice : o.price <= lastPrice)
    )
    .map((o) => o.id);
}

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  cancelledIds: [],

  hydrate: (symbol, orders) =>
    set((s) => {
      // 过滤掉已本地撤单的服务端订单：撤单后服务端可能仍短暂返回 open，
      // 若不过滤会在 5s 轮询后“复活”为当前委托。仅 SRV- 前缀参与对账。
      const cancelled = new Set(s.cancelledIds);
      const incoming = orders.filter(
        (o) => !o.id.startsWith("SRV-") || !cancelled.has(Number(o.id.slice(4)))
      );
      return { orders: [...incoming, ...s.orders.filter((o) => o.symbol !== symbol)] };
    }),

  place: (order) => set((s) => ({ orders: [order, ...s.orders] })),

  cancel: (id) =>
    set((s) => {
      // 仅真实服务端订单（SRV-<num>）记入黑名单；本地模拟 id 不参与
      if (!id.startsWith("SRV-")) {
        return {
          orders: s.orders.map((o) =>
            o.id === id && o.status === "open" ? { ...o, status: "canceled", settledTs: Date.now() } : o
          ),
        };
      }
      const srv = Number(id.slice(4));
      return {
        orders: s.orders.map((o) =>
          o.id === id && o.status === "open" ? { ...o, status: "canceled", settledTs: Date.now() } : o
        ),
        cancelledIds: s.cancelledIds.includes(srv) ? s.cancelledIds : [...s.cancelledIds, srv],
      };
    }),

  fill: (id) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id && o.status === "open" ? { ...o, status: "filled", settledTs: Date.now() } : o
      ),
    })),

  fillMatching: (symbol, lastPrice) =>
    set((s) => {
      const ids = findFillable(s.orders, symbol, lastPrice);
      if (ids.length === 0) return s;
      const now = Date.now();
      return {
        orders: s.orders.map((o) =>
          ids.includes(o.id) ? { ...o, status: "filled" as const, settledTs: now } : o
        ),
      };
    }),
}));
