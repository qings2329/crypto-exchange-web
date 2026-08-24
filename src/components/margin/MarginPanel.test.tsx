// MarginPanel 回归测试：空态借币流程 / 账户卡片渲染 / 还款与全部还清。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { MarginPanel } from "./MarginPanel";
import { api, ApiError } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    marginBorrow: vi.fn(),
    marginRepay: vi.fn(),
    marginAccount: vi.fn(),
    marginAccounts: vi.fn().mockResolvedValue([]),
    marginLiqPrice: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: number;
    status: number;
    constructor(msg: string, code: number, status: number) {
      super(msg);
      this.code = code;
      this.status = status;
    }
  },
  tokenStore: { uid: "7" },
}));

const acc = {
  asset: "BTC",
  collateralAsset: "USDT",
  collateral: 100,
  debt: 0.3,
  interest: 0.001,
  totalOwed: 0.301,
  leverage: 3,
  status: "active" as const,
};

function renderPanel() {
  return render(
    <I18nProvider>
      <MarginPanel defaultAsset="BTC" />
    </I18nProvider>
  );
}

describe("MarginPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无活跃账户（404）→ 显示空态提示，可提交借入并刷新账户", async () => {
    (api.marginAccount as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError("no account", 404, 404));
    (api.marginBorrow as ReturnType<typeof vi.fn>).mockResolvedValue(acc);

    renderPanel();
    expect(await screen.findByTestId("margin-empty")).toBeDefined();

    fireEvent.change(screen.getByTestId("margin-borrow-amount"), { target: { value: "0.9" } });
    // 抵押预估 = 0.9 / 3 = 0.3 USDT
    expect(screen.getByTestId("margin-collateral-required").textContent).toContain("0.3");
    fireEvent.click(screen.getByTestId("margin-borrow-btn"));

    await waitFor(() => {
      expect(api.marginBorrow).toHaveBeenCalledWith({ asset: "BTC", amount: 0.9, leverage: 3 });
    });
  });

  it("有活跃账户 → 渲染账户卡片（抵押/债务/利息/应还/强平价），借币表单禁用", async () => {
    (api.marginAccount as ReturnType<typeof vi.fn>).mockResolvedValue(acc);
    (api.marginLiqPrice as ReturnType<typeof vi.fn>).mockResolvedValue(317.94);

    renderPanel();
    expect(await screen.findByTestId("margin-account-card")).toBeDefined();
    expect(screen.getByTestId("margin-liq-price").textContent).toContain("317");
    // 借币按钮禁用（已有活跃账户）
    expect((screen.getByTestId("margin-borrow-btn") as HTMLButtonElement).disabled).toBe(true);
    // 还款：输入金额后可用
    expect((screen.getByTestId("margin-repay-btn") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("margin-repay-amount"), { target: { value: "0.1" } });
    expect((screen.getByTestId("margin-repay-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("还款：按输入金额调用 marginRepay 并刷新账户", async () => {
    (api.marginAccount as ReturnType<typeof vi.fn>).mockResolvedValue(acc);
    (api.marginLiqPrice as ReturnType<typeof vi.fn>).mockResolvedValue(300);
    (api.marginRepay as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    renderPanel();
    await screen.findByTestId("margin-account-card");
    fireEvent.change(screen.getByTestId("margin-repay-amount"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByTestId("margin-repay-btn"));

    await waitFor(() => {
      expect(api.marginRepay).toHaveBeenCalledWith({ asset: "BTC", amount: 0.1 });
      expect(api.marginAccount).toHaveBeenCalledTimes(2); // 初始 + 刷新
    });
  });

  it("资产切换到 ETH 后按新资产查询账户", async () => {
    (api.marginAccount as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError("no account", 404, 404));
    renderPanel();
    await screen.findByTestId("margin-empty");
    fireEvent.click(screen.getByTestId("margin-asset-ETH"));
    await waitFor(() => {
      expect(api.marginAccount).toHaveBeenLastCalledWith("ETH");
    });
  });
});
