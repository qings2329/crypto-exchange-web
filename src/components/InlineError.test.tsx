import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import i18n from "../i18n/i18next";
import "../i18n/index"; // 副作用：mergeDicts(DICTS) 把业务字典并入 i18next
import { InlineError } from "./InlineError";

// 锁定 InlineError 各类错误的渲染结构（本次统一报错渲染的核心组件）。
function renderErr(props: { err: unknown; failKey?: string }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <InlineError {...props} />
    </I18nextProvider>,
  );
}

describe("InlineError 渲染快照", () => {
  it("无错误时渲染 null（不污染布局）", () => {
    const { container } = renderErr({ err: null });
    expect(container.firstChild).toBeNull();
  });

  it("默认加载失败（common.loadError，带原始报错）", () => {
    const { asFragment } = renderErr({ err: new Error("network down") });
    expect(asFragment()).toMatchSnapshot();
  });

  it("403 forbidden：权限不足提示（无登录入口）", () => {
    const { asFragment } = renderErr({ err: { status: 403, message: "Forbidden" } });
    expect(asFragment()).toMatchSnapshot();
  });

  it("401 unauthorized：请先登录 + 登录入口", () => {
    const { asFragment } = renderErr({ err: { status: 401, message: "Unauthorized" } });
    expect(asFragment()).toMatchSnapshot();
  });

  it("自定义 failKey（如 bot.fail，带原始报错）", () => {
    const { asFragment } = renderErr({ err: new Error("boom"), failKey: "bot.fail" });
    expect(asFragment()).toMatchSnapshot();
  });
});
