// RFC 4226 附录 D 测试向量（secret = ASCII "12345678901234567890"）+ Base32 往返 + otpauth 格式。
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateSecret, hotp, otpauthUrl, timeCounter, verifyTotp } from "./totp";

const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));
// GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_VECTORS: [number, string][] = [
  [0, "755224"],
  [1, "287082"],
  [2, "359152"],
  [3, "969429"],
  [4, "338314"],
  [5, "254676"],
  [6, "287922"],
  [7, "162583"],
  [8, "399871"],
  [9, "520489"],
];

describe("totp", () => {
  it("RFC 4226 测试向量全部命中", async () => {
    for (const [counter, code] of RFC_VECTORS) {
      expect(await hotp(RFC_SECRET, counter)).toBe(code);
    }
  });

  it("Base32 编解码往返", () => {
    const bytes = new Uint8Array(20).map((_, i) => (i * 37 + 11) % 256);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    // 标准向量 secret
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("generateSecret：20 字节 Base32（32 字符，无易混淆 0/1）", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("otpauthUrl 符合 Google Authenticator 格式", () => {
    const url = otpauthUrl("ABC234DEF", "user@ce.dev");
    expect(url).toBe(
      "otpauth://totp/CryptoExchange:user%40ce.dev?secret=ABC234DEF&issuer=CryptoExchange&algorithm=SHA1&digits=6&period=30"
    );
  });

  it("verifyTotp：当前码通过，±1 窗通过，错误码/格式拒绝", async () => {
    const now = 59_000; // 与 RFC 向量对齐：t=59s → counter=1 → 287082
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, timeCounter(now)), now)).toBe(true);
    // 前一步的码（时钟偏移 -1）也应通过
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, timeCounter(now) - 1), now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, "000000", now)).toBe(false); // 恰好错的码
    expect(await verifyTotp(RFC_SECRET, "28708", now)).toBe(false); // 位数不足
    expect(await verifyTotp(RFC_SECRET, "abcdef", now)).toBe(false); // 非数字
  });
});
