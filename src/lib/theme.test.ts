import { describe, it, expect, beforeEach } from "vitest";
import { THEMES, applyTheme } from "../lib/theme";

describe("theme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("THEMES 包含 6 个预设主题", () => {
    expect(THEMES).toHaveLength(6);
    const values = THEMES.map((t) => t.value);
    expect(values).toEqual(
      expect.arrayContaining(["dark", "light", "midnight", "forest", "solar", "system"])
    );
  });

  it("applyTheme 将具体主题写入 <html data-theme>", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyTheme("midnight");
    expect(document.documentElement.getAttribute("data-theme")).toBe("midnight");
  });

  it("system 主题在无 prefers-color-scheme:dark 时回退 light", () => {
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
