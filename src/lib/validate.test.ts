import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidPhone,
  isValidAccount,
  isValidCryptoAddress,
  validateAmount,
  validatePassword,
} from "./validate";

describe("validate email/phone/account", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.example.cn")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("no-at.com")).toBe(false);
    expect(isValidEmail("  ")).toBe(false);
  });
  it("accepts valid phones", () => {
    expect(isValidPhone("13800138000")).toBe(true);
    expect(isValidPhone("+8613800138000")).toBe(true);
  });
  it("rejects invalid phones", () => {
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("1234567890123456")).toBe(false); // 16 位超限
  });
  it("isValidAccount accepts email or phone", () => {
    expect(isValidAccount("a@b.com")).toBe(true);
    expect(isValidAccount("13800138000")).toBe(true);
    expect(isValidAccount("notanaccount")).toBe(false);
  });
});

describe("validate crypto address", () => {
  it("accepts EVM (0x + 40 hex)", () => {
    expect(isValidCryptoAddress("0x" + "a".repeat(40))).toBe(true);
    expect(isValidCryptoAddress("0x52908400098527886E0F7030069857D2E4169EE7")).toBe(true);
  });
  it("accepts generic base58/bech32 style", () => {
    expect(isValidCryptoAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa".repeat(1).slice(0, 34))).toBe(true);
    expect(isValidCryptoAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidCryptoAddress("0x123")).toBe(false);
    expect(isValidCryptoAddress("too short")).toBe(false);
    expect(isValidCryptoAddress("has space in it address")).toBe(false);
    expect(isValidCryptoAddress("")).toBe(false);
  });
});

describe("validateAmount", () => {
  it("rejects empty / nan / nonpositive", () => {
    expect(validateAmount("").ok).toBe(false);
    expect(validateAmount("abc").ok).toBe(false);
    expect(validateAmount("0").ok).toBe(false);
    expect(validateAmount("-5").ok).toBe(false);
  });
  it("accepts positive numbers and returns parsed value", () => {
    const r = validateAmount("12.5");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12.5);
  });
  it("respects min / max bounds", () => {
    expect(validateAmount("5", { min: 10 }).ok).toBe(false);
    expect(validateAmount("50", { max: 10 }).ok).toBe(false);
    expect(validateAmount("10", { min: 10, max: 20 }).ok).toBe(true);
  });
});

describe("validatePassword", () => {
  it("requires >= 8 chars with letters and digits", () => {
    expect(validatePassword("short1")).toBe(false);
    expect(validatePassword("allletters")).toBe(false);
    expect(validatePassword("12345678")).toBe(false);
    expect(validatePassword("abcd1234")).toBe(true);
    expect(validatePassword("Str0ng!Pass9")).toBe(true);
  });
});
