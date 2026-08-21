/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect Cloud projectId（https://cloud.reown.com 免费注册；缺省用占位符，仅注入钱包可用） */
  readonly VITE_WC_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
