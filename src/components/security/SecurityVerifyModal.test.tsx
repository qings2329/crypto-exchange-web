// SecurityVerifyModal 集成单测：滑块→下一步→邮箱码错误/正确；2FA 未绑定时 totp tab 禁用。
// 注意：拖拽的 pointerdown/move/up 必须各自独立触发（fireEvent 自带 act 同步提交），
// 不能包进单个 act()，否则 setDragging 批处理延迟会让 move 读到过期闭包。
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../Toast";
import { SecurityVerifyModal } from "./SecurityVerifyModal";
import { SliderCaptcha } from "./SliderCaptcha";
import { useSecurityStore } from "../../store/security-store";
import { demoEmailCode } from "../../lib/secure-utils";

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const RECT_344 = () =>
  ({ left: 0, top: 0, right: 344, bottom: 44, width: 344, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

/** 模拟几何：track 宽 344px，滑块 44px → 最大行程 300px */
function mockGeometry() {
  const track = screen.getByTestId("captcha-track");
  Object.defineProperty(track, "clientWidth", { value: 344, configurable: true });
  track.getBoundingClientRect = RECT_344;
}

/** 完整拖拽到最右侧（每个事件独立同步提交） */
function passSlider() {
  mockGeometry();
  const handle = screen.getByTestId("captcha-handle");
  fireEvent.pointerDown(handle, { clientX: 22, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 330, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: 330, pointerId: 1 });
}

function mount(action: Parameters<typeof SecurityVerifyModal>[0]["action"], onClose = vi.fn()) {
  render(
    <ToastProvider>
      <SecurityVerifyModal action={action} onClose={onClose} />
    </ToastProvider>
  );
  return onClose;
}

describe("SliderCaptcha", () => {
  it("通过后锁定：再次拖拽不重复发放 token（一次性语义）", () => {
    const onPass = vi.fn();
    render(<SliderCaptcha onPass={onPass} />);
    passSlider();
    expect(onPass).toHaveBeenCalledTimes(1);
    // 通过态下再拖：onPointerDown 直接 return，不产生第二个 token
    const handle = screen.getByTestId("captcha-handle");
    fireEvent.pointerDown(handle, { clientX: 22, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 330, pointerId: 2 });
    expect(onPass).toHaveBeenCalledTimes(1);
    expect((onPass.mock.calls[0][0] as string).length).toBeGreaterThan(0);
  });
});

describe("SecurityVerifyModal", () => {
  it("初始为滑块步骤，未通过前「下一步」禁用，通过后解锁", () => {
    mount("withdraw");
    expect(screen.getByTestId("verify-step-captcha")).toBeDefined();
    expect((screen.getByTestId("captcha-next") as HTMLButtonElement).disabled).toBe(true);
    passSlider();
    expect((screen.getByTestId("captcha-next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("2FA 未绑定：进入验证码步骤默认邮箱模式且 totp tab 禁用", () => {
    useSecurityStore.setState({ twofaEnabled: false, twofaSecret: undefined });
    mount("password");
    passSlider();
    fireEvent.click(screen.getByTestId("captcha-next"));
    expect(screen.getByTestId("verify-step-code")).toBeDefined();
    expect((screen.getByTestId("verify-tab-totp") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("send-email-code")).toBeDefined();
  });

  it("邮箱码：错误码提示剩余次数，正确码 resolve(true)", async () => {
    useSecurityStore.setState({ twofaEnabled: false, twofaSecret: undefined });
    const onClose = mount("withdraw");
    passSlider();
    fireEvent.click(screen.getByTestId("captcha-next"));
    const input = screen.getByTestId("verify-code-input") as HTMLInputElement;

    // 错误码 → 剩余 4 次
    fireEvent.change(input, { target: { value: "000000" } });
    fireEvent.click(screen.getByTestId("verify-submit"));
    await waitFor(() => expect(screen.getByTestId("verify-error").textContent).toContain("4"));
    expect(onClose).not.toHaveBeenCalled();

    // 正确码（uid 为 null → anon 种子）
    const code = demoEmailCode(`anon:withdraw`);
    fireEvent.change(input, { target: { value: code } });
    fireEvent.click(screen.getByTestId("verify-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  });

  it("非 6 位数字被格式校验拦截且无法提交", () => {
    useSecurityStore.setState({ twofaEnabled: false, twofaSecret: undefined });
    mount("generic");
    passSlider();
    fireEvent.click(screen.getByTestId("captcha-next"));
    fireEvent.change(screen.getByTestId("verify-code-input"), { target: { value: "12ab" } });
    // 输入过滤非数字后只剩 12 → 不满足提交条件
    const input = screen.getByTestId("verify-code-input") as HTMLInputElement;
    expect(input.value).toBe("12");
    expect((screen.getByTestId("verify-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
