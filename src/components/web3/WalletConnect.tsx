// 顶栏钱包连接（RainbowKit ConnectButton.Custom 全定制，匹配币安风格 Header）：
// - 未连接：品牌黄 "Connect Wallet" 按钮；
// - 已连接：网络徽标（绿点=正常 / 红=错误网络）+ USDT/BTC 模拟余额 + 地址缩写。

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalances } from "../../hooks/use-balances";

function Balances() {
  const balances = useBalances();
  const usdt = balances.availableOf("USDT");
  const btc = balances.availableOf("BTC");
  if (balances.rows.length === 0) return null;
  return (
    <div className="hidden items-center gap-3 font-mono text-xs tabular-nums lg:flex">
      <span className="text-muted">
        <span className="font-semibold text-foreground">{usdt.toLocaleString("en-US")}</span> USDT
      </span>
      <span className="text-muted">
        <span className="font-semibold text-foreground">{btc.toFixed(4)}</span> BTC
      </span>
    </div>
  );
}

export function WalletConnect() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = Boolean(account) && Boolean(chain);
        return (
          <div className="flex items-center gap-2">
            {!connected ? (
              <button
                onClick={openConnectModal}
                className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-accent-hover"
              >
                Connect Wallet
              </button>
            ) : (
              <>
                <button
                  onClick={openChainModal}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    chain!.unsupported
                      ? "border-sell/50 text-sell hover:bg-sell/10"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${chain!.unsupported ? "bg-sell" : "bg-buy"}`} />
                  {chain!.unsupported ? "Wrong Network" : chain!.name}
                </button>
                <Balances />
                <button
                  onClick={openAccountModal}
                  className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 font-mono text-xs font-medium tabular-nums text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  {account!.displayName}
                </button>
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
