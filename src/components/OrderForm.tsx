import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

// 下单表单：限价买/卖。下单走网关 -> spot 服务 -> 撮合引擎。
export function OrderForm({ symbol }: { symbol: string }) {
  const { t } = useI18n();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const p = parseFloat(price);
    const q = parseFloat(qty);
    if (!p || !q) {
      setMsg(t("trade.errPriceQty"));
      return;
    }
    try {
      const r = await api.placeOrder(symbol, side, p, q);
      setMsg(t("trade.submitted", { id: r.order_id }));
    } catch (e) {
      setMsg(t("trade.fail", { err: (e as Error).message }));
    }
  };

  return (
    <div className="orderform">
      <div className="seg">
        <button
          className={side === "buy" ? "btn active buy" : "btn"}
          onClick={() => setSide("buy")}
        >
          {t("trade.buy")}
        </button>
        <button
          className={side === "sell" ? "btn active sell" : "btn"}
          onClick={() => setSide("sell")}
        >
          {t("trade.sell")}
        </button>
      </div>
      <label>
        {t("trade.price")}
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
      </label>
      <label>
        {t("trade.qty")}
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.0000" />
      </label>
      <button className="submit" onClick={submit}>
        {t("trade.submit")}
      </button>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
