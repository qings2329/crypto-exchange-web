import { describe, expect, it } from "vitest";
import { demoEmailCode, fnv1a, maskValue } from "./secure-utils";

describe("secure-utils", () => {
  it("maskValue：中间打码，保留首尾", () => {
    expect(maskValue("TF1q2w3e4r5t6y7u")).toBe("TF1****6y7u");
    expect(maskValue("user@ce.dev", { leading: 4, trailing: 5 })).toBe("user****e.dev");
    expect(maskValue("12345678901", { leading: 3, trailing: 4 })).toBe("123****8901");
    expect(maskValue("abc")).toBe("***"); // 过短全遮
    expect(maskValue("")).toBe("");
  });

  it("fnv1a：确定性且区分输入", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
    expect(fnv1a("hello")).not.toBe(fnv1a("hellp"));
    expect(fnv1a("")).toBe("811c9dc5"); // FNV offset basis
  });

  it("demoEmailCode：同种子同码、6 位数字", () => {
    expect(demoEmailCode("3:withdraw")).toBe(demoEmailCode("3:withdraw"));
    expect(demoEmailCode("3:withdraw")).toMatch(/^\d{6}$/);
    expect(demoEmailCode("3:withdraw")).not.toBe(demoEmailCode("3:password"));
  });
});
