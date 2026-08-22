// 静态校验：源码中所有字面量 i18n key 引用（t("...") / t('...') / failKey="..."，
// 以及 t(`ns.${x}`) 这类动态模板的静态前缀）都必须在字典中存在。
// 字典 = index.tsx 的 DICTS（业务全量） ∪ locales/*.json（核心文本）。
// 目的：防止「引用了已被删除 / 拼写错误的 key」这类回归——这类问题运行时只会
// 静默回退成原始 key 字符串，单测难以发现，只能靠静态扫描兜底。
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";
import zhTW from "./locales/zh-TW.json";
import jaJP from "./locales/ja-JP.json";

const SRC_DIR = join(__dirname, "..", "..");
const DICTS_FILE = join(__dirname, "index.tsx");

interface Ref {
  key: string;
  file: string;
  line: number;
  prefix: boolean; // true = 动态模板静态前缀，只需存在以该前缀开头的 key
}

function availableKeys(): Set<string> {
  const keys = new Set<string>();
  // 业务全量字典：在 index.tsx 中以 "ns.sub": "value" 形式定义（DICTS 未导出，
  // 故用正则静态提取；locale 名 "zh-CN": { 因冒号后非引号而不会被误匹配）。
  const src = readFileSync(DICTS_FILE, "utf8");
  const re = /"([\w.\-]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) keys.add(m[1]);
  // 核心文本语言包
  for (const pack of [zhCN, enUS, zhTW, jaJP]) {
    for (const k of Object.keys(pack)) keys.add(k);
  }
  return keys;
}

function referencedKeys(): Ref[] {
  const refs: Ref[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
        const lines = readFileSync(p, "utf8").split("\n");
        lines.forEach((line, i) => {
          // 字面量：t("key") / t('key')（同时覆盖 useI18n / useTranslation / i18next.t）
          const lit = /\bt\(\s*["']([\w.\-]+)["']/g;
          let m: RegExpExecArray | null;
          while ((m = lit.exec(line))) {
            refs.push({ key: m[1], file: p, line: i + 1, prefix: false });
          }
          // 字面量：failKey="key"（含 InlineError 默认 failKey = "common.loadError"）
          const fk = /\bfailKey\s*=\s*["']([\w.\-]+)["']/g;
          while ((m = fk.exec(line))) {
            refs.push({ key: m[1], file: p, line: i + 1, prefix: false });
          }
          // 动态模板：t(`ns.${x}...`) → 取 ${ 之前的静态前缀做前缀匹配
          const tpl = /\bt\(\s*`([^`]*)`/g;
          while ((m = tpl.exec(line))) {
            const prefix = m[1].split("${")[0];
            if (prefix.length > 0) {
              refs.push({ key: prefix, file: p, line: i + 1, prefix: true });
            }
          }
        });
      }
    }
  };
  walk(SRC_DIR);
  return refs;
}

describe("i18n 字典引用静态校验", () => {
  const avail = availableKeys();
  const refs = referencedKeys();

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const ok = r.prefix
      ? [...avail].some((k) => k.startsWith(r.key))
      : avail.has(r.key);
    if (!ok) {
      const label = r.prefix ? `前缀 "${r.key}"` : `"${r.key}"`;
      const id = `${label} @ ${r.file}:${r.line}`;
      if (!seen.has(id)) {
        seen.add(id);
        missing.push(id);
      }
    }
  }

  it(`所有引用的 i18n key 均存在于字典（扫描 ${refs.length} 处引用 / 可用 key ${avail.size} 个）`, () => {
    expect(missing, `缺失或无法匹配前缀的 key 引用：\n${missing.join("\n")}`).toEqual([]);
  });
});
