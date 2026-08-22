// react-i18next 实例：核心文本（Header/下单面板/订单状态）迁移至 JSON 语言包。
// 与既有自定义 i18n（src/i18n/index.tsx）共存：locale 单一来源仍是 I18nProvider，
// 其变化通过 changeLanguage 同步到 i18next；插值占位符沿用 {var} 风格。

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";
import zhTW from "./locales/zh-TW.json";
import jaJP from "./locales/ja-JP.json";
// 业务全量字典（旧 DICTS）由 I18nProvider 模块经 mergeDicts 注入底层资源
// （避免 i18next ↔ index 循环导入）：JSON 语言包为已迁移核心文本，同名键以 JSON 为准。

export const I18NEXT_LOCALES = ["zh-CN", "en-US", "zh-TW", "ja-JP"] as const;

export type Dict = Record<string, string>;

/** 把业务字典并入对应语言资源（JSON 键优先覆盖）；幂等，可在 DICTS 就绪后调用。 */
export function mergeDicts(dict: Record<string, Dict>) {
  for (const [lng, d] of Object.entries(dict)) {
    const existing = i18n.getResourceBundle(lng, "translation") ?? {};
    i18n.addResourceBundle(lng, "translation", { ...d, ...existing }, true, true);
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
    "zh-TW": { translation: zhTW },
    "ja-JP": { translation: jaJP },
  },
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
  returnEmptyString: false,
});

export default i18n;
