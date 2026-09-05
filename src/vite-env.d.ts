/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect Cloud projectId（https://cloud.reown.com 免费注册；缺省用占位符，仅注入钱包可用） */
  readonly VITE_WC_PROJECT_ID?: string;
  /** 自建行情网关根路径（默认 /api/v1/market）；置空字符串则回退直连 Binance */
  readonly VITE_MARKET_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
