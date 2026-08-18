import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.error("出错了")}>err</button>
      <button onClick={() => toast.success("成功")}>ok</button>
    </div>
  );
}

describe("Toast", () => {
  it("useToast 可显示 error / success 通知", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("err"));
    });
    expect(screen.getByText("出错了")).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(screen.getByText("成功")).toBeDefined();
  });

  it("点击 toast 可关闭", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("err"));
    });
    const node = screen.getByText("出错了");
    act(() => {
      fireEvent.click(node);
    });
    expect(screen.queryByText("出错了")).toBeNull();
  });

  it("toast 在 ttl 后自动消失", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("err"));
    });
    expect(screen.getByText("出错了")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("出错了")).toBeNull();
    vi.useRealTimers();
  });
});
