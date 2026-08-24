// 演示用充值地址派生：按「账户 + 资产 + 网络」确定性生成格式合规的地址，
// 同一输入恒定输出（刷新/重登不变）。真实环境应由后端 HD 派生下发
// （Go settlement.DepositAddressGenerator，xpub 非硬化子地址），此处为前端演示占位。

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HEX = "0123456789abcdef";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** 从种子逐字符确定性取字母表字符 */
function deriveChars(seed: string, alphabet: string, len: number): string {
  let out = "";
  for (let i = 0; out.length < len; i++) {
    out += alphabet[fnv1a(`${seed}#${i}`) % alphabet.length];
  }
  return out;
}

/**
 * 生成演示充值地址：
 * - BTC → bech32（bc1q…）
 * - TRX 或 USDT/USDC 的 TRC 网络 → Tron（T…）
 * - 其余（ETH、ERC20 等）→ EVM（0x…）
 */
export function demoDepositAddress(
  uid: string | number | null | undefined,
  asset: string,
  network?: string
): string {
  const a = asset.trim().toUpperCase();
  const n = (network ?? "").trim().toUpperCase();
  const seed = `${uid ?? "anon"}:${a}:${n}`;
  if (a === "BTC") return `bc1q${deriveChars(seed, BECH32, 38)}`;
  if (a === "TRX" || ((a === "USDT" || a === "USDC") && n.includes("TRC"))) {
    return `T${deriveChars(seed, BASE58, 33)}`;
  }
  return `0x${deriveChars(seed, HEX, 40)}`;
}
