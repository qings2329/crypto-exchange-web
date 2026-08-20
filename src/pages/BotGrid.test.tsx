import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { ConfirmProvider } from "../components/Confirm";
import { BotGrid } from "./BotGrid";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    botStrategies: vi.fn(),
    botCreateStrategy: vi.fn(),
    botStartStrategy: vi.fn(),
    botStopStrategy: vi.fn(),
    botStrategyOrders: vi.fn(),
  },
}));

const mockStrategies = [
  {
    id: 1,
    user_id: 1,
    name: "BTC网格",
    market: "spot",
    symbol: "BTC_USDT",
    side: "buy",
    type: "grid",
    params: { grid_lower: 30000, grid_upper: 40000, grid_num: 10, order_amount: 100, max_position: 5000 },
    status: "active",
    grid_state: { position: 0.5, pnl: 120.5, trade_count: 42, last_price: 35000, prev_price: 34800, initialized: true },
    created_at: 1700000000,
  },
  {
    id: 2,
    user_id: 1,
    name: "ETH定投",
    market: "spot",
    symbol: "ETH_USDT",
    side: "buy",
    type: "dca",
    params: { dca_interval_sec: 3600, dca_amount: 50, order_amount: 50 },
    status: "stopped",
    created_at: 1700000000,
  },
];

function renderPage() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <BotGrid />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

describe("BotGrid page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.botStrategies as ReturnType<typeof vi.fn>).mockResolvedValue(mockStrategies);
  });

  it("renders strategy list on load", async () => {
    renderPage();
    expect(await screen.findByText("BTC网格")).toBeDefined();
    expect(screen.getByText("ETH定投")).toBeDefined();
    expect(screen.getAllByText("BTC_USDT").length).toBeGreaterThanOrEqual(1);
  });

  it("shows PnL and trade count for active strategy", async () => {
    renderPage();
    await screen.findByText("BTC网格");
    expect(screen.getByText("+120.5")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });

  it("shows empty state when no strategies", async () => {
    (api.botStrategies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("暂无策略")).toBeDefined();
  });

  it("toggles create form visibility", async () => {
    renderPage();
    await screen.findByText("BTC网格");

    fireEvent.click(screen.getByText("新建策略"));
    expect(screen.getByText("策略名称")).toBeDefined();

    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByText("新建网格策略")).toBeNull();
  });

  it("shows validation error when creating with empty fields", async () => {
    renderPage();
    await screen.findByText("BTC网格");

    fireEvent.click(screen.getByText("新建策略"));
    fireEvent.click(screen.getByText("创建策略"));

    expect(screen.getByText(/请填写完整信息/)).toBeDefined();
  });

  it("calls botCreateStrategy on valid form submit", async () => {
    (api.botCreateStrategy as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findByText("BTC网格");

    fireEvent.click(screen.getByText("新建策略"));

    const nameInput = screen.getByPlaceholderText("如：BTC网格策略");
    fireEvent.change(nameInput, { target: { value: "测试网格" } });
    const symbolInput = screen.getByPlaceholderText("如 BTC_USDT");
    fireEvent.change(symbolInput, { target: { value: "BTC_USDT" } });
    const tokenInput = screen.getByPlaceholderText(/Bearer token/);
    fireEvent.change(tokenInput, { target: { value: "test-token" } });

    const numberInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(numberInputs[0], { target: { value: "30000" } });
    fireEvent.change(numberInputs[1], { target: { value: "40000" } });
    fireEvent.change(numberInputs[2], { target: { value: "10" } });
    fireEvent.change(numberInputs[3], { target: { value: "100" } });

    fireEvent.click(screen.getByText("创建策略"));

    await waitFor(() => {
      expect(api.botCreateStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "测试网格",
          symbol: "BTC_USDT",
          user_token: "test-token",
        }),
      );
    });
  });

  it("shows grid range error when lower >= upper", async () => {
    renderPage();
    await screen.findByText("BTC网格");

    fireEvent.click(screen.getByText("新建策略"));

    const nameInput = screen.getByPlaceholderText("如：BTC网格策略");
    fireEvent.change(nameInput, { target: { value: "x" } });
    const symbolInput = screen.getByPlaceholderText("如 BTC_USDT");
    fireEvent.change(symbolInput, { target: { value: "BTC_USDT" } });
    const tokenInput = screen.getByPlaceholderText(/Bearer token/);
    fireEvent.change(tokenInput, { target: { value: "t" } });

    const numberInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(numberInputs[0], { target: { value: "50000" } });
    fireEvent.change(numberInputs[1], { target: { value: "30000" } });
    fireEvent.change(numberInputs[2], { target: { value: "10" } });
    fireEvent.change(numberInputs[3], { target: { value: "100" } });

    fireEvent.click(screen.getByText("创建策略"));

    expect(screen.getByText(/下沿必须小于上沿/)).toBeDefined();
  });

  it("calls botStopStrategy for active strategy after confirm", async () => {
    (api.botStopStrategy as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findByText("BTC网格");

    const stopLink = screen.getAllByText("停止").find((el) => el.tagName === "BUTTON" && el.className.includes("link-btn"))!;
    fireEvent.click(stopLink);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/确认停止策略/)).toBeDefined();

    const confirmBtn = within(dialog).getAllByText("停止").find((el) => el.tagName === "BUTTON" && el.className.includes("danger"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.botStopStrategy).toHaveBeenCalledWith(1);
    });
  });

  it("calls botStartStrategy for stopped strategy after confirm", async () => {
    (api.botStartStrategy as ReturnType<typeof vi.fn>).mockResolvedValue({});
    renderPage();
    await screen.findByText("ETH定投");

    const startLink = screen.getAllByText("启动").find((el) => el.tagName === "BUTTON" && el.className.includes("link-btn"))!;
    fireEvent.click(startLink);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/确认启动策略/)).toBeDefined();

    const confirmBtn = within(dialog).getAllByText("启动").find((el) => el.tagName === "BUTTON" && el.className.includes("primary"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.botStartStrategy).toHaveBeenCalledWith(2);
    });
  });

  it("loads orders when view orders clicked", async () => {
    const mockOrders = [
      { id: 100, strategy_id: 1, user_id: 1, market: "spot", symbol: "BTC_USDT", side: "buy", price: 32000, qty: 0.003, client_oid: "", exchange_order_id: "", status: "filled", created_at: 1700000000 },
    ];
    (api.botStrategyOrders as ReturnType<typeof vi.fn>).mockResolvedValue(mockOrders);
    renderPage();
    await screen.findByText("BTC网格");

    fireEvent.click(screen.getByText("查看订单"));

    await waitFor(() => {
      expect(api.botStrategyOrders).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText("32000")).toBeDefined();
  });
});
