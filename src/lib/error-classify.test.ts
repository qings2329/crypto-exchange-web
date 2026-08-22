import { describe, it, expect } from "vitest";
import { classifyError, errorToText } from "./utils";
import { ApiError } from "../api/client";

describe("classifyError", () => {
  it("401 → unauthorized", () => {
    expect(classifyError(new ApiError("登录已过期", 401, 401))).toBe("unauthorized");
  });

  it("403 → forbidden（已登录但权限不足，区别于未登录）", () => {
    expect(classifyError(new ApiError("权限不足", 1003, 403))).toBe("forbidden");
  });

  it("其他状态码 → null", () => {
    expect(classifyError(new ApiError("请求参数错误", 400, 400))).toBe(null);
  });

  it("纯文本含鉴权关键词 → unauthorized（无状态码兜底）", () => {
    expect(classifyError("令牌已过期，请重新登录")).toBe("unauthorized");
  });

  it("纯文本不含关键词 → null", () => {
    expect(classifyError("网络连接失败")).toBe(null);
  });

  it("Error 对象按 message 判定", () => {
    expect(classifyError(new Error("未登录"))).toBe("unauthorized");
  });

  it("errorToText 归一成可读文本", () => {
    expect(errorToText(new ApiError("x", 1, 500))).toBe("x");
    expect(errorToText("plain")).toBe("plain");
    expect(errorToText(new Error("boom"))).toBe("boom");
  });
});
