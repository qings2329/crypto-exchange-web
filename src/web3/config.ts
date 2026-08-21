// wagmi 配置：主网 + RainbowKit 默认连接器（注入钱包 / WalletConnect / Coinbase）。
// WalletConnect 需在 https://cloud.reown.com 注册 projectId 并写入 .env.local：
//   VITE_WC_PROJECT_ID=xxxx
// 未配置时使用占位符——MetaMask 等注入钱包不受影响，仅 WalletConnect 扫码不可用。

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet } from "wagmi/chains";

const projectId = import.meta.env.VITE_WC_PROJECT_ID ?? "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "CryptoExchange",
  projectId,
  chains: [mainnet],
  ssr: false,
});
