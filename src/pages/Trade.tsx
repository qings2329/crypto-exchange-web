import { Header } from "../components/Header";
import { TickerBar } from "../components/Ticker";
import { KLineChart } from "../components/KLineChart";
import { OrderBook } from "../components/OrderBook";
import { OrderForm } from "../components/OrderForm";

// 现货交易页：行情条（WS）+ K 线图（Canvas 自绘）+ 订单簿（WS）+ 下单（带鉴权）。
export function Trade() {
  const symbol = "BTC_USDT";
  return (
    <div className="trade">
      <div className="header">
        <Header symbol={symbol} />
        <TickerBar symbol={symbol} />
      </div>
      <div className="grid">
        <KLineChart symbol={symbol} interval="1m" />
        <div>
          <OrderBook symbol={symbol} />
          <OrderForm symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
