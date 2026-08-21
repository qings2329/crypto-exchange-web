// Web3 Provider：WagmiProvider 必须位于 QueryClientProvider 内部
// （本应用 AppProviders 已提供），RainbowKitProvider 提供连接弹窗 UI。

import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "../../web3/config";

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={darkTheme()} modalSize="compact">
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
