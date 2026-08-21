// 证件上传校验纯函数：格式白名单 + 大小上限。
import { describe, expect, it } from "vitest";
import { MAX_DOC_SIZE, validateDoc } from "./DocUpload";

describe("validateDoc", () => {
  it("接受 JPG/PNG/WebP 且 ≤5MB", () => {
    expect(validateDoc({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateDoc({ type: "image/png", size: MAX_DOC_SIZE })).toBeNull();
    expect(validateDoc({ type: "image/webp", size: 3 * 1024 * 1024 })).toBeNull();
  });

  it("拒绝不支持的格式（PDF/GIF/HEIC）", () => {
    expect(validateDoc({ type: "application/pdf", size: 100 })).toBe("format");
    expect(validateDoc({ type: "image/gif", size: 100 })).toBe("format");
    expect(validateDoc({ type: "image/heic", size: 100 })).toBe("format");
  });

  it("拒绝超过 5MB 的图片", () => {
    expect(validateDoc({ type: "image/png", size: MAX_DOC_SIZE + 1 })).toBe("size");
    expect(validateDoc({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("size");
  });
});
