import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { Lending } from "./Lending";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    lendingPools: vi.fn(),
    lendingMyLends: vi.fn(),
    lendingMyBorrows: vi.fn(),
    lendingLend: vi.fn(),
    lendingBorrow: vi.fn(),
    lendingWithdraw: vi.fn(),
    lendingRepay: vi.fn(),
  },
}));

const mockPools = [
  { id: 1, asset: "USDT", total_supply: "100000", total_borrow: "40000", available: "60000", interest_rate: 0.05, collateral_req: 1.5 },
  { id: 2, asset: "ETH", total_supply: "500", total_borrow: "200", available: "300", interest_rate: 0.03, collateral_req: 1.2 },
];

const mockLends = [
  { id: 10, user_id: 1, pool_id: 1, amount: "5000", rate: 0.05, status: "active", created_at: 1700000000 },
];

const mockBorrows = [
  { id: 20, user_id: 1, pool_id: 1, amount: "2000", collateral: "4000", rate: 0.05, interest_acc: "12.5", status: "active", created_at: 1700000000, repaid_at: 0 },
];

function renderPage() {
  return render(
    <I18nProvider>
      <Lending />
    </I18nProvider>,
  );
}

describe("Lending page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.lendingPools as ReturnType<typeof vi.fn>).mockResolvedValue(mockPools);
    (api.lendingMyLends as ReturnType<typeof vi.fn>).mockResolvedValue(mockLends);
    (api.lendingMyBorrows as ReturnType<typeof vi.fn>).mockResolvedValue(mockBorrows);
  });

  it("renders pool list on load", async () => {
    renderPage();
    expect(await screen.findAllByText("USDT")).toBeDefined();
    expect(screen.getAllByText("ETH").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("5.00%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders my lends and borrows", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("5000")).toBeDefined();
    });
    expect(screen.getByText("2000")).toBeDefined();
    expect(screen.getByText("4000")).toBeDefined();
  });

  it("lend submit button disabled when no pool selected", async () => {
    renderPage();
    await screen.findAllByText("USDT");
    const btn = screen.getByText("确认存款");
    expect(btn).toBeDisabled();
  });

  it("calls lendingLend on valid lend submit", async () => {
    (api.lendingLend as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findAllByText("USDT");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "1" } });

    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[0], { target: { value: "1000" } });

    fireEvent.click(screen.getByText("确认存款"));

    await waitFor(() => {
      expect(api.lendingLend).toHaveBeenCalledWith(1, "1000");
    });
  });

  it("calls lendingBorrow on valid borrow submit", async () => {
    (api.lendingBorrow as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findAllByText("USDT");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "1" } });

    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[1], { target: { value: "500" } });
    fireEvent.change(spinbuttons[2], { target: { value: "1000" } });

    fireEvent.click(screen.getByText("确认借款"));

    await waitFor(() => {
      expect(api.lendingBorrow).toHaveBeenCalledWith(1, "500", "1000");
    });
  });

  it("calls lendingWithdraw when withdraw clicked", async () => {
    (api.lendingWithdraw as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findByText("5000");

    fireEvent.click(screen.getByText("提取"));

    await waitFor(() => {
      expect(api.lendingWithdraw).toHaveBeenCalledWith(10);
    });
  });

  it("calls lendingRepay when repay clicked", async () => {
    (api.lendingRepay as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findByText("2000");

    fireEvent.click(screen.getByText("还款"));

    await waitFor(() => {
      expect(api.lendingRepay).toHaveBeenCalledWith(20);
    });
  });

  it("shows empty state when no pools", async () => {
    (api.lendingPools as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.lendingMyLends as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.lendingMyBorrows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("暂无可用借贷池")).toBeDefined();
    expect(screen.getByText("暂无存款记录")).toBeDefined();
    expect(screen.getByText("暂无借款记录")).toBeDefined();
  });
});
