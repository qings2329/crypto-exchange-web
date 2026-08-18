import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { I18nProvider, useI18n } from "./index";

describe("i18n", () => {
  it("t 返回中文翻译（默认 zh-CN）", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("nav.home")).toBe("首页");
  });

  it("缺失 key 回退到 key 本身", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("definitely.missing.key")).toBe("definitely.missing.key");
  });

  it("t 支持 {var} 插值", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("nav.user", { uid: 42 })).toBe("用户 #42");
  });

  it("切换 locale 后 t 返回对应语言", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    act(() => result.current.setLocale("en-US"));
    expect(result.current.locale).toBe("en-US");
    expect(result.current.t("nav.home")).toBe("Home");
  });
});
