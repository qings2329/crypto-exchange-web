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
}

interface OrdersState {
  orders: TradeOrder[];
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

  hydrate: (symbol, orders) =>
    set((s) => ({
      orders: [...orders, ...s.orders.filter((o) => o.symbol !== symbol)],
    })),

  place: (order) => set((s) => ({ orders: [order, ...s.orders] })),

  cancel: (id) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id && o.status === "open" ? { ...o, status: "canceled", settledTs: Date.now() } : o
      ),
    })),

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
