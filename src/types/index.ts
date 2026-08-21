// 行情 / 交易领域类型（对齐 Binance 公共行情接口字段命名）。

export type KlineInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w";

/** 24h Ticker 快照 */
export interface Ticker {
  symbol: string; // BTCUSDT
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number; // 成交量（base asset）
  quoteVolume: number; // 成交额（quote asset）
  priceChange: number;
  priceChangePercent: number; // 24h 涨跌幅 %
}

/** K 线 */
export interface Kline {
  time: number; // 开盘时间 ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 盘口档位 [price, quantity] */
export type OrderBookLevel = [number, number];

export interface OrderBook {
  bids: OrderBookLevel[]; // 买盘，价格降序
  asks: OrderBookLevel[]; // 卖盘，价格升序
}

/** 公共成交流水 */
export interface PublicTrade {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean; // true 视为主动卖出（红），false 为主动买入（绿）
}

/** WS 连接状态 */
export type WsStatus = "connecting" | "open" | "closed" | "error";
