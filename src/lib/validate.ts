// 表单校验工具：在客户端尽早拦截明显非法输入，减少无效请求与资金风险。
// 注意：这些是「便利性」校验，服务端仍是最终权威（地址归属链、余额、风控等）。

// 邮箱（宽松但实用）：local@domain.tld
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 手机号（支持 + 号、区号，6~15 位数字）
const PHONE_RE = /^\+?[0-9]{6,15}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isValidPhone(s: string): boolean {
  return PHONE_RE.test(s.trim());
}

// 账号可为邮箱或手机号（注册/登录使用）
export function isValidAccount(s: string): boolean {
  const v = s.trim();
  return isValidEmail(v) || isValidPhone(v);
}

// 链上地址：EVM（0x + 40 hex）或通用 base58/bech32 风格（25~90 位字母数字，无空格）。
export function isValidCryptoAddress(s: string): boolean {
  const v = s.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return true;
  return /^[A-Za-z0-9]{25,90}$/.test(v) && !/\s/.test(v);
}

export interface AmountResult {
  ok: boolean;
  value?: number;
  error?: "empty" | "nan" | "nonpositive" | "belowMin" | "aboveMax";
}

// 金额：可解析、有限、> 0；可选 min / max（含）边界校验。
export function validateAmount(
  raw: string,
  opts?: { min?: number; max?: number }
): AmountResult {
  const v = raw.trim();
  if (v === "") return { ok: false, error: "empty" };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: "nan" };
  if (n <= 0) return { ok: false, error: "nonpositive" };
  if (opts?.min != null && n < opts.min) return { ok: false, error: "belowMin" };
  if (opts?.max != null && n > opts.max) return { ok: false, error: "aboveMax" };
  return { ok: true, value: n };
}

// 密码强度：>= 8 位且同时含字母与数字（基础要求）。
export function validatePassword(s: string): boolean {
  return s.length >= 8 && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
}
