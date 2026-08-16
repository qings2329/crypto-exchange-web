import { Header } from "../components/Header";
import { TickerBar } from "../components/Ticker";
import { OrderBook } from "../components/OrderBook";
import { OrderForm } from "../components/OrderForm";

// 现货交易页：行情条（WS）+ 订单簿（WS）+ 下单（带鉴权）。
export function Trade() {
  const symbol = "BTC_USDT";
  return (
    <div className="trade">
      <Header symbol={symbol} />
      <TickerBar symbol={symbol} />
      <div className="grid">
        <OrderBook symbol={symbol} />
        <OrderForm symbol={symbol} />
      </div>
    </div>
  );
}
