// orders-store 单元测试：下单/撤单/成交与行情撮合逻辑。

import { describe, expect, it, beforeEach } from "vitest";
import { findFillable, useOrdersStore, type TradeOrder } from "./orders-store";

function order(partial: Partial<TradeOrder>): TradeOrder {
  return {
    id: "SIM-TEST",
    symbol: "BTCUSDT",
    side: "buy",
    type: "limit",
    price: 100,
    qty: 1,
    total: 100,
    ts: Date.now(),
    status: "open",
    ...partial,
  };
}

beforeEach(() => {
  useOrdersStore.setState({ orders: [], cancelledIds: [] });
});

describe("findFillable", () => {
  it("买单：限价 >= 最新价时可成交", () => {
    const open = [order({ id: "A", side: "buy", price: 100 })];
    expect(findFillable(open, "BTCUSDT", 101)).toEqual([]);
    expect(findFillable(open, "BTCUSDT", 100)).toEqual(["A"]);
  });

  it("卖单：限价 <= 最新价时可成交", () => {
    const open = [order({ id: "B", side: "sell", price: 100 })];
    expect(findFillable(open, "BTCUSDT", 99)).toEqual([]);
    expect(findFillable(open, "BTCUSDT", 100)).toEqual(["B"]);
  });

  it("忽略非当前交易对 / 已结算 / 市价单", () => {
    const open = [
      order({ id: "C", symbol: "ETHUSDT" }),
      order({ id: "D", status: "filled" }),
      order({ id: "E", type: "market" }),
    ];
    expect(findFillable(open, "BTCUSDT", 50)).toEqual([]);
  });

  it("最新价无效时返回空", () => {
    expect(findFillable([order({})], "BTCUSDT", 0)).toEqual([]);
    expect(findFillable([order({})], "BTCUSDT", NaN)).toEqual([]);
  });
});

describe("useOrdersStore", () => {
  it("place：新单前插", () => {
    const { place } = useOrdersStore.getState();
    place(order({ id: "A" }));
    place(order({ id: "B" }));
    expect(useOrdersStore.getState().orders.map((o) => o.id)).toEqual(["B", "A"]);
  });

  it("cancel：仅 open 单可撤销并记录时间", () => {
    const { place, cancel } = useOrdersStore.getState();
    place(order({ id: "A", status: "open" }));
    cancel("A");
    const a = useOrdersStore.getState().orders[0];
    expect(a.status).toBe("canceled");
    expect(a.settledTs).toBeGreaterThan(0);
    // 已成交单不可撤销
    place(order({ id: "B", status: "filled" }));
    cancel("B");
    expect(useOrdersStore.getState().orders.find((o) => o.id === "B")?.status).toBe("filled");
  });

  it("fillMatching：按最新价批量成交 open 单", () => {
    const { place, fillMatching } = useOrdersStore.getState();
    place(order({ id: "BUY", side: "buy", price: 90 })); // 买单价 90：市价跌到 90 及以下成交
    place(order({ id: "SELL", side: "sell", price: 110 })); // 卖单价 110：市价涨到 110 及以上成交
    place(order({ id: "FAR", side: "buy", price: 50 }));

    fillMatching("BTCUSDT", 95); // 市价 95：BUY 未到价、SELL 未到价
    let st = useOrdersStore.getState();
    expect(st.orders.find((o) => o.id === "BUY")?.status).toBe("open");
    expect(st.orders.find((o) => o.id === "SELL")?.status).toBe("open");

    fillMatching("BTCUSDT", 88); // 市价跌破 90：BUY 成交，FAR(50) 不动
    st = useOrdersStore.getState();
    expect(st.orders.find((o) => o.id === "BUY")?.status).toBe("filled");
    expect(st.orders.find((o) => o.id === "FAR")?.status).toBe("open");

    fillMatching("BTCUSDT", 120); // 市价涨破 110：SELL 成交
    expect(useOrdersStore.getState().orders.find((o) => o.id === "SELL")?.status).toBe("filled");
  });

  it("fillMatching：不触碰其他交易对的挂单", () => {
    const { place, fillMatching } = useOrdersStore.getState();
    place(order({ id: "ETH", symbol: "ETHUSDT", price: 90 }));
    fillMatching("BTCUSDT", 200);
    expect(useOrdersStore.getState().orders.find((o) => o.id === "ETH")?.status).toBe("open");
  });
});

describe("cancelledIds 黑名单（撤单对账）", () => {
  it("cancel：SRV- 单记录服务端号且去重；本地 id 不入黑名单", () => {
    const { place, cancel } = useOrdersStore.getState();
    place(order({ id: "SRV-101" }));
    cancel("SRV-101");
    expect(useOrdersStore.getState().cancelledIds).toEqual([101]);
    // 重复撤同一单不重复记录
    cancel("SRV-101");
    expect(useOrdersStore.getState().cancelledIds).toEqual([101]);
    // 本地模拟单撤销不污染黑名单
    place(order({ id: "SPOT-9" }));
    cancel("SPOT-9");
    expect(useOrdersStore.getState().cancelledIds).toEqual([101]);
  });

  it("hydrate：黑名单内的服务端单被过滤，不再“复活”", () => {
    const { hydrate, cancel } = useOrdersStore.getState();
    hydrate("BTCUSDT", [order({ id: "SRV-7" }), order({ id: "SRV-8" })]);
    cancel("SRV-7");
    // 轮询仍返回 SRV-7（服务端尚未确认撤销）→ 应被丢弃
    hydrate("BTCUSDT", [order({ id: "SRV-7" }), order({ id: "SRV-8" }), order({ id: "SRV-9", price: 111 })]);
    const ids = useOrdersStore.getState().orders.map((o) => o.id);
    expect(ids).not.toContain("SRV-7");
    expect(ids).toContain("SRV-8");
    expect(ids).toContain("SRV-9");
  });

  it("hydrate：本地镜像单不受黑名单影响（其他交易对订单保留）", () => {
    const { place, cancel, hydrate } = useOrdersStore.getState();
    place(order({ id: "SPOT-1", symbol: "ETHUSDT" }));
    cancel("SPOT-1"); // 本地撤单：不污染黑名单
    hydrate("BTCUSDT", []); // 仅替换 BTCUSDT 集合
    expect(useOrdersStore.getState().orders.map((o) => o.id)).toEqual(["SPOT-1"]);
  });
});
