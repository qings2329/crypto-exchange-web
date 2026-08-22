import { useTranslation } from "react-i18next";
import { classifyError, errorToText } from "../lib/utils";

// 页面内联错误：统一判定 401 / 403 并渲染对应提示，替换各页面重复的 inline 报错 JSX。
// - forbidden(403)：已登录但权限不足 → 「权限不足」提示（不引导登录）
// - unauthorized(401)：未登录/会话过期 → 「请先登录」+ 登录入口
// - 其他：加载失败 + 原始报错（failKey 可指定页面特有文案，默认 common.loadError）
export function InlineError({
  err,
  failKey = "common.loadError",
}: {
  err: unknown;
  failKey?: string;
}) {
  const { t } = useTranslation();
  const kind = classifyError(err);
  if (!err) return null;

  if (kind === "forbidden") {
    return (
      <div className="error">
        {t("common.forbiddenAction")}
        <span className="ml-1 muted">{t("forbidden.contact")}</span>
      </div>
    );
  }

  if (kind === "unauthorized") {
    return (
      <div className="error">
        {t("common.authRequired")}
        <a href="#/login" className="ml-1 underline hover:text-accent">
          {t("header.login")}
        </a>
      </div>
    );
  }

  return <div className="error">{t(failKey, { err: errorToText(err) })}</div>;
}
