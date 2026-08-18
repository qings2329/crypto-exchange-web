// 轻量时区：不引入第三方依赖。
// - 用户可在设置页选择时区；为空字符串 "" 表示「跟随系统/浏览器」。
// - 选择持久化到 localStorage（与语言/主题一致）；formatDateTime 读取该值并据此渲染时间。
// - 统一兼容多种后端时间戳规格：纳秒(>=1e15)、毫秒(>=1e12)、秒(>=1e9)、ISO 字符串。
// - 地区跟随当前界面语言（读取 i18n 的 localStorage key），未设置时使用浏览器默认。

const TZ_KEY = "cx_timezone";

// 常用时区（交易所场景覆盖主要金融中心）；完整列表可用 Intl.supportedValuesOf("timeZone")。
export const COMMON_TZ: string[] = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// 读取用户时区："" 表示跟随系统。
export function getTimeZone(): string {
  try {
    return localStorage.getItem(TZ_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setTimeZone(tz: string) {
  try {
    if (tz) localStorage.setItem(TZ_KEY, tz);
    else localStorage.removeItem(TZ_KEY);
  } catch {
    /* ignore */
  }
}

// 解析为具体 IANA 时区；自动模式回退到浏览器时区，再回退 UTC。
export function resolveTimeZone(): string {
  const tz = getTimeZone();
  if (tz) return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// 读取当前界面语言（i18n 持久化 key），用于时间地区化。
function uiLocale(): string | undefined {
  try {
    const l =
      localStorage.getItem("cx_locale") ||
      localStorage.getItem("cx_admin_locale");
    return l && l.length ? l : undefined;
  } catch {
    return undefined;
  }
}

// 多种时间戳规格归一为毫秒。
function toMs(v: number | string): number {
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) v = n;
    else return new Date(v).getTime();
  }
  if (v >= 1e15) return v / 1e6; // 纳秒
  if (v >= 1e12) return v; // 毫秒
  if (v >= 1e9) return v * 1000; // 秒
  return v;
}

// 时区感知的时间格式化；空/非法输入返回占位符。
export function formatDateTime(
  input: number | string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (input === null || input === undefined || input === "" || input === 0) {
    return "--";
  }
  const ms =
    input instanceof Date ? input.getTime() : toMs(input as number | string);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "--";
  try {
    return new Intl.DateTimeFormat(uiLocale(), {
      timeZone: resolveTimeZone(),
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...opts,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
