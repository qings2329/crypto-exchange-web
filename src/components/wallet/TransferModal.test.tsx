import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/i18next";
import "../../i18n/index";

// 划转弹窗仅依赖 api.futuresTransfer；ApiError 用于错误分支的 instanceof 判定。
vi.mock("../../api/client", () => ({
  api: {
    futuresTransfer: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../../api/client";
import { TransferModal, type WalletRow } from "./AssetOverview";

const futuresTransfer = vi.mocked(api.futuresTransfer);

const baseRow: WalletRow = { asset: "USDT", available: 100, frozen: 50 };

function renderModal(overrides: Partial<Parameters<typeof TransferModal>[0]> = {}) {
  const props = {
    row: baseRow,
    onClose: vi.fn(),
    onDone: vi.fn(),
    t: (k: string) => k,
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <TransferModal {...props} />
    </I18nextProvider>,
  );
}

describe("TransferModal 划转弹窗", () => {
  beforeEach(() => {
    futuresTransfer.mockReset();
  });

  it("渲染币种图标与标题", () => {
    renderModal();
    expect(screen.getByTestId("coin-badge-USDT")).toHaveTextContent("U");
    expect(screen.getByRole("heading")).toHaveTextContent("Transfer USDT");
  });

  it("默认方向为 资金→合约，展示可用余额", () => {
    renderModal();
    expect(screen.getByText("Funding → Futures")).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
  });

  it("切换到 合约→资金 后展示保证金(冻结)余额", () => {
    renderModal();
    fireEvent.click(screen.getByText("Futures → Funding"));
    expect(screen.getByText(/Margin/)).toBeInTheDocument();
  });

  it("提交成功调用 futuresTransfer 并触发 onDone", async () => {
    futuresTransfer.mockResolvedValue({} as never);
    const onDone = vi.fn();
    renderModal({ onDone });

    fireEvent.change(screen.getByTestId("transfer-amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("transfer-submit"));

    await waitFor(() =>
      expect(futuresTransfer).toHaveBeenCalledWith({ asset: "USDT", amount: 10, direction: "to_futures" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("金额超过可用余额时不下单", () => {
    renderModal();
    fireEvent.change(screen.getByTestId("transfer-amount"), { target: { value: "999" } });
    fireEvent.click(screen.getByTestId("transfer-submit"));
    expect(futuresTransfer).not.toHaveBeenCalled();
  });

  it("提交失败不触发 onDone", async () => {
    futuresTransfer.mockRejectedValue(new Error("network down"));
    const onDone = vi.fn();
    renderModal({ onDone });

    fireEvent.change(screen.getByTestId("transfer-amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("transfer-submit"));

    await waitFor(() => expect(futuresTransfer).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
  });
});
