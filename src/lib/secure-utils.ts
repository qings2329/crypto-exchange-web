// 金融级安全工具：敏感文本打码、完整性哈希、演示环境邮箱验证码派生。
// 注意：前端哈希仅用于 DOM 篡改自检与演示验证码，不作为真正的密码学保障。

/** FNV-1a 32 位哈希（同步、无依赖），返回 8 位十六进制 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * 中间打码：保留 leading + trailing 字符，其余以 * 替换（固定 4 个，防长度泄露）。
 * 过短字符串全遮。
 */
export function maskValue(
  value: string,
  opts: { leading?: number; trailing?: number } = {}
): string {
  const { leading = 3, trailing = 4 } = opts;
  if (!value) return "";
  if (value.length <= leading + trailing) return "*".repeat(value.length);
  return `${value.slice(0, leading)}****${value.slice(-trailing)}`;
}

/**
 * 演示环境的邮箱验证码：由种子（uid:action）确定性派生 6 位数字。
 * 真实环境应改为服务端下发；此处保证「发送后 toast 展示的码」可被校验。
 */
export function demoEmailCode(seed: string): string {
  return String(parseInt(fnv1a(seed), 16) % 1000000).padStart(6, "0");
}
