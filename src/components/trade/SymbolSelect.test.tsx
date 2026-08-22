import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SymbolSelect, TRADE_SYMBOLS } from "./SymbolSelect";

describe("SymbolSelect 交易对选择器", () => {
  it("渲染当前交易对，展开后选择新交易对回调 onChange", () => {
    const onChange = vi.fn();
    render(<SymbolSelect value="BTCUSDT" onChange={onChange} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("BTCUSDT");

    fireEvent.click(btn);
    const opt = screen.getByText("ETHUSDT");
    expect(opt).toBeInTheDocument();

    fireEvent.click(opt);
    expect(onChange).toHaveBeenCalledWith("ETHUSDT");
  });

  it("导出常用 USDT 交易对列表非空且含 BTCUSDT", () => {
    expect(TRADE_SYMBOLS.length).toBeGreaterThan(0);
    expect(TRADE_SYMBOLS).toContain("BTCUSDT");
  });
});
