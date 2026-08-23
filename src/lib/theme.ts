// 轻量多主题：不引入第三方依赖。
// - 预设配色：dark / light / midnight / forest / solar，由 CSS [data-theme="..."] 变量块驱动。
// - system：跟随操作系统 prefers-color-scheme，在 light / dark 间自动切换，并监听系统变化实时生效。
// - 选择持久化到后端用户偏好（prefs.theme）；applyTheme 负责把逻辑主题解析为具体 data-theme 并写入 <html>。

export type ThemeId = "dark" | "light" | "midnight" | "forest" | "solar" | "system";

export const THEMES: { value: ThemeId; key: string }[] = [
  { value: "dark", key: "settings.theme.dark" },
  { value: "light", key: "settings.theme.light" },
  { value: "midnight", key: "settings.theme.midnight" },
  { value: "forest", key: "settings.theme.forest" },
  { value: "solar", key: "settings.theme.solar" },
  { value: "system", key: "settings.theme.system" },
];

type Concrete = "dark" | "light" | "midnight" | "forest" | "solar";

const mq =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

let sysListener: ((e: MediaQueryListEvent) => void) | null = null;

function resolve(theme: ThemeId): Concrete {
  if (theme === "system") return mq && mq.matches ? "dark" : "light";
  return theme;
}

// 应用主题：写入 <html data-theme>，并对 system 注册/清理系统配色监听。
// 同时把 color-scheme 同步给浏览器，使原生控件（<select>、input autofill、
// 滚动条）与主题一致，避免暗色界面下原生下拉呈「白底白字、宽度自适应变大」。
export function applyTheme(theme: ThemeId) {
  if (sysListener && mq) {
    mq.removeEventListener("change", sysListener);
    sysListener = null;
  }
  const concrete = resolve(theme);
  document.documentElement.setAttribute("data-theme", concrete);
  document.documentElement.style.colorScheme = concrete === "light" || concrete === "solar" ? "light" : "dark";
  if (theme === "system" && mq) {
    sysListener = () => {
      const c = resolve("system");
      document.documentElement.setAttribute("data-theme", c);
      document.documentElement.style.colorScheme = c === "light" || c === "solar" ? "light" : "dark";
    };
    mq.addEventListener("change", sysListener);
  }
}

// 启动即应用主题：默认暗色（符合品牌默认 Midnight Black），避免首屏 data-theme
// 为 null 时整页依赖 :root 兜底、且在 light/system 偏好下整页变白的割裂。
export function initTheme(defaultTheme: ThemeId = "dark") {
  applyTheme(defaultTheme);
}
