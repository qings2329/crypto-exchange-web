import { useState } from "react";
import { api } from "../api/client";

// 下单表单：限价买/卖。下单走网关 -> spot 服务 -> 撮合引擎。
export function OrderForm({ symbol }: { symbol: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const p = parseFloat(price);
    const q = parseFloat(qty);
    if (!p || !q) {
      setMsg("请输入价格和数量");
      return;
    }
    try {
      const r = await api.placeOrder(symbol, side, p, q);
      setMsg(`已提交，订单号 ${r.order_id}`);
    } catch (e) {
      setMsg(`下单失败: ${(e as Error).message}`);
    }
  };

  return (
    <div className="orderform">
      <div className="seg">
        <button
          className={side === "buy" ? "active buy" : ""}
          onClick={() => setSide("buy")}
        >
          买入
        </button>
        <button
          className={side === "sell" ? "active sell" : ""}
          onClick={() => setSide("sell")}
        >
          卖出
        </button>
      </div>
      <label>
        价格
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
      </label>
      <label>
        数量
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.0000" />
      </label>
      <button className="submit" onClick={submit}>
        下单
      </button>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
