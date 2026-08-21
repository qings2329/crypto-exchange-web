// react-i18next 实例：核心文本（Header/下单面板/订单状态）迁移至 JSON 语言包。
// 与既有自定义 i18n（src/i18n/index.tsx）共存：locale 单一来源仍是 I18nProvider，
// 其变化通过 changeLanguage 同步到 i18next；插值占位符沿用 {var} 风格。

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";
import zhTW from "./locales/zh-TW.json";
import jaJP from "./locales/ja-JP.json";

export const I18NEXT_LOCALES = ["zh-CN", "en-US", "zh-TW", "ja-JP"] as const;

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
