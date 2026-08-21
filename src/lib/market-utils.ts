// 行情大厅纯工具：模糊搜索、排序、代币全名映射（便于单测）。
import type { Ticker } from "../types";

export type SortKey = "price" | "change" | "high" | "low" | "volume";

export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

/** 常见代币全名映射（Binance API 不返回全名，仅用于展示）。 */
const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", TRX: "TRON", AVAX: "Avalanche",
  LINK: "Chainlink", DOT: "Polkadot", MATIC: "Polygon", POL: "Polygon",
  LTC: "Litecoin", BCH: "Bitcoin Cash", UNI: "Uniswap", ATOM: "Cosmos",
  NEAR: "NEAR Protocol", APT: "Aptos", ARB: "Arbitrum", OP: "Optimism",
  SUI: "Sui", SEI: "Sei", TIA: "Celestia", INJ: "Injective",
  FIL: "Filecoin", ETC: "Ethereum Classic", XLM: "Stellar", HBAR: "Hedera",
  ICP: "Internet Computer", RENDER: "Render", RNDR: "Render", FET: "Artificial Superintelligence",
  PEPE: "Pepe", SHIB: "Shiba Inu", WIF: "dogwifhat", BONK: "Bonk",
  ORDI: "ORDI", JUP: "Jupiter", PYTH: "Pyth Network", STRK: "Starknet",
  ETHFI: "Ether.fi", ENA: "Ethena", WLD: "Worldcoin", TAO: "Bittensor",
};

/** 交易对基础代码：BTCUSDT -> BTC */
export function baseAsset(symbol: string): string {
  for (const quote of ["USDT", "FDUSD", "USDC", "TUSD", "BUSD", "BTC", "ETH", "BNB"]) {
    if (symbol.endsWith(quote)) return symbol.slice(0, -quote.length);
  }
  return symbol;
}

/** 代币展示名：有映射用映射，否则用代码本身。 */
export function coinName(symbol: string): string {
  return COIN_NAMES[baseAsset(symbol)] ?? baseAsset(symbol);
}

/** 名称/代码实时模糊搜索：大小写不敏感的子串匹配。 */
export function fuzzyFilter(rows: Ticker[], query: string): Ticker[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((t) => t.symbol.toLowerCase().includes(q) || coinName(t.symbol).toLowerCase().includes(q));
}

/** 按指定列与方向排序（返回新数组，不修改入参）。 */
export function sortTickers(rows: Ticker[], sort: SortState): Ticker[] {
  const val = (t: Ticker): number =>
    sort.key === "price" ? t.lastPrice
    : sort.key === "change" ? t.priceChangePercent
    : sort.key === "high" ? t.highPrice
    : sort.key === "low" ? t.lowPrice
    : t.quoteVolume;
  return [...rows].sort((a, b) => (val(a) - val(b)) * sort.dir);
}
