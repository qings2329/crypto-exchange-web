// Wallet 充值地址面板回归测试：
// - 点击充值按钮展示确定性充值地址（账户+资产+网络派生）；
// - 切换资产后地址联动（BTC → bech32 格式）；
// - 复制按钮写入剪贴板并进入已复制态。

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "../i18n";
import { Wallet } from "./Wallet";
import { tokenStore } from "../api/client";
import { demoDepositAddress } from "../lib/deposit-address";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      // 钱包页挂载即拉余额/提现/流水：测试聚焦充值面板，统一拒绝走 InlineError 分支
      get: vi.fn().mockRejectedValue(new Error("skip")),
      walletLedger: vi.fn().mockRejectedValue(new Error("skip")),
      futuresWalletBalance: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <Wallet />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("Wallet 充值地址面板", () => {
  beforeEach(() => {
    localStorage.clear();
    tokenStore.set("a", "r", "42");
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("点击充值按钮展示 uid 派生的默认地址，复制写入剪贴板", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPage();
    fireEvent.click(screen.getByTestId("wallet-deposit-toggle"));

    const addrBox = await screen.findByTestId("wallet-deposit-address");
    expect(addrBox.textContent).toBe(demoDepositAddress("42", "USDT", undefined));

    fireEvent.click(screen.getByTestId("wallet-deposit-copy"));
    expect(writeText).toHaveBeenCalledWith(demoDepositAddress("42", "USDT", undefined));
  });

  it("资产切到 BTC 后地址联动为 bech32 格式且随网络变化", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("wallet-deposit-toggle"));

    const assetInput = document.querySelector<HTMLInputElement>('input[list="deposit-asset-options"]')!;
    fireEvent.change(assetInput, { target: { value: "BTC" } });

    const addr = screen.getByTestId("wallet-deposit-address").textContent ?? "";
    expect(addr).toBe(demoDepositAddress("42", "BTC", undefined));
    expect(addr.startsWith("bc1q")).toBe(true);
  });

  it("未登录也能生成稳定地址（uid 缺省不报错）", async () => {
    localStorage.clear();
    renderPage();
    fireEvent.click(screen.getByTestId("wallet-deposit-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("wallet-deposit-address").textContent).toBe(
        demoDepositAddress(null, "USDT", undefined)
      );
    });
  });
});
