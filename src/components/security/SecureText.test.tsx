// SecureText 单测：掩码展示 + DOM 篡改自检（周期比对还原 + 上报事件 + integrity 标记）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SecureText } from "./SecureText";

describe("SecureText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("默认明文展示，guard 关闭时被篡改不还原", () => {
    render(<SecureText value="12345678" guard={false} />);
    const el = screen.getByTestId("secure-text");
    expect(el.textContent).toBe("12345678");
    act(() => {
      el.textContent = "HACKED";
      vi.advanceTimersByTime(2000);
    });
    expect(el.textContent).toBe("HACKED");
    expect(el.getAttribute("data-integrity")).toBe("ok");
  });

  it("mask 模式按首尾保留打码", () => {
    render(<SecureText value="TWDa83kF91xYq7u6" mask maskOpts={{ leading: 4, trailing: 4 }} />);
    const el = screen.getByTestId("secure-text");
    expect(el.textContent).toMatch(/^TWDa\*+q7u6$/);
  });

  it("篡改后下一周期还原并派发 cx-security-tamper 事件", () => {
    const handler = vi.fn();
    window.addEventListener("cx-security-tamper", handler);
    render(<SecureText value="$76,792.03" />);
    const el = screen.getByTestId("secure-text");
    expect(el.getAttribute("data-integrity")).toBe("ok");

    act(() => {
      el.textContent = "0.00";
      vi.advanceTimersByTime(900);
    });
    expect(el.textContent).toBe("$76,792.03");
    expect(el.getAttribute("data-integrity")).toBe("restored");
    expect(handler).toHaveBeenCalledTimes(1);
    // 多次篡改只告警一次（warned 去抖），但每次都会还原
    act(() => {
      el.textContent = "1.00";
      vi.advanceTimersByTime(900);
    });
    expect(el.textContent).toBe("$76,792.03");
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("cx-security-tamper", handler);
  });
});
