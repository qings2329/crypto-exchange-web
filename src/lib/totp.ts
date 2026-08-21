// RFC 6238 TOTP / RFC 4226 HOTP 纯实现（Web Crypto HMAC-SHA1）。
// - generateSecret：随机 20 字节 → Base32；
// - otpauthUrl：otpauth://totp/Issuer:account?secret=..&issuer=..（Google Authenticator 标准）；
// - hotp(counter)：RFC 4226 测试向量可校验；verifyTotp(code) 允许 ±1 时间窗（30s/步）。

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function otpauthUrl(secret: string, account: string, issuer = "CryptoExchange"): string {
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  );
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message as BufferSource);
  return new Uint8Array(sig);
}

/** RFC 4226 HOTP：counter 驱动的 6 位动态码。 */
export async function hotp(secret: string, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  // 64 位大端计数器
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const mac = await hmacSha1(base32Decode(secret), msg);
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** 当前时间步计数（默认 30s）。 */
export function timeCounter(now = Date.now(), step = 30): number {
  return Math.floor(now / 1000 / step);
}

/** 校验 6 位验证码：允许 ±1 步时钟偏移。 */
export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = timeCounter(now);
  for (const drift of [0, -1, 1]) {
    if ((await hotp(secret, counter + drift)) === code) return true;
  }
  return false;
}
