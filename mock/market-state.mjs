// 单一行情数据源：K线 / 深度 / Ticker / 成交 / 下单 / 合约估值 全部共用同一份「按 symbol 的实时价格」，
// 避免多源随机游走导致的「K线价格与订单簿价格不一致」等问题。
// 由 gateway.mjs 与 kline-server.mjs 共同引用，自身不依赖其它模块（无循环依赖）。
const r2 = (x) => Math.round(x * 100) / 100;

const PRICES = {
  BTC: 68000, ETH: 3500, BNB: 600, SOL: 150, XRP: 2.5, DOGE: 0.12,
  ADA: 0.45, DOT: 6.5, AVAX: 35, LINK: 15, LTC: 85, TRX: 0.16,
  TON: 5.5, NEAR: 5, APT: 9,
};

export function basePrice(symbol) {
  const s = (symbol || "").toUpperCase();
  for (const k of Object.keys(PRICES)) if (s.startsWith(k)) return PRICES[k];
  return 7.2;
}

const live = new Map();

export function livePrice(symbol) {
  const key = (symbol || "").toUpperCase();
  if (!live.has(key)) live.set(key, basePrice(key));
  return live.get(key);
}

// 演化实时价（随机游走）。vol 仅影响波动幅度，不影响多源一致性——所有行情都读写同一份 live 值。
export function tickLive(symbol, vol = 0.003) {
  const key = (symbol || "").toUpperCase();
  const p = livePrice(key);
  const np = Math.max(1e-8, p + (Math.random() - 0.5) * p * vol);
  live.set(key, r2(np));
  return live.get(key);
}
