// SliderCaptcha 单测：拖拽过阈值触发 onPass（携带一次性 token），未达阈值回弹不触发。
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SliderCaptcha } from "./SliderCaptcha";

// jsdom 无 Pointer Capture 实现
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/** 模拟几何：track 宽 344px，滑块 44px → 最大行程 300px */
function mockGeometry() {
  const track = screen.getByTestId("captcha-track");
  Object.defineProperty(track, "clientWidth", { value: 344, configurable: true });
  track.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 344, bottom: 44, width: 344, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function dragTo(clientX: number) {
  const handle = screen.getByTestId("captcha-handle");
  fireEvent.pointerDown(handle, { clientX: 22, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX, pointerId: 1 });
}

describe("SliderCaptcha", () => {
  it("拖到最右侧通过校验并回调 token", () => {
    const onPass = vi.fn();
    render(<SliderCaptcha onPass={onPass} />);
    mockGeometry();
    dragTo(330); // (330-22+22)/300 ≈ 1.1 → clamp 1
    expect(onPass).toHaveBeenCalledTimes(1);
    const token = onPass.mock.calls[0][0] as string;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    // 通过态：提示切换为已通过
    expect(screen.getByTestId("captcha-passed")).toBeDefined();
  });

  it("未达阈值回弹且不触发 onPass", () => {
    const onPass = vi.fn();
    render(<SliderCaptcha onPass={onPass} />);
    mockGeometry();
    dragTo(100); // progress ≈ 0.26
    expect(onPass).not.toHaveBeenCalled();
    expect(screen.queryByTestId("captcha-passed")).toBeNull();
  });

  it("未按下直接移动不产生进度", () => {
    const onPass = vi.fn();
    render(<SliderCaptcha onPass={onPass} />);
    mockGeometry();
    fireEvent.pointerMove(screen.getByTestId("captcha-handle"), { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("captcha-handle"), { clientX: 400, pointerId: 1 });
    expect(onPass).not.toHaveBeenCalled();
  });
});
