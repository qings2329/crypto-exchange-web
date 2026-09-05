import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../i18n"; // 初始化 i18next（error.boundary.* 核心文本），否则 ErrorBoundary 默认兜底会原样回退 key
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("渲染崩溃时显示兜底界面并展示错误信息", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbg = vi.spyOn(console, "debug").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    spy.mockRestore();
    dbg.mockRestore();
    expect(screen.getByText("页面出错了")).toBeDefined();
    expect(screen.getByText("kaboom")).toBeDefined();
  });

  it("支持自定义 fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbg = vi.spyOn(console, "debug").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={(e) => <div>custom:{e.message}</div>}>
        <Boom />
      </ErrorBoundary>
    );
    spy.mockRestore();
    dbg.mockRestore();
    expect(screen.getByText("custom:kaboom")).toBeDefined();
  });
});
