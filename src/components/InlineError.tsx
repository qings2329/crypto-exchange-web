import { useTranslation } from "react-i18next";
import { classifyError, errorToText } from "../lib/utils";

// 页面内联错误：统一判定 401 / 403 并渲染对应提示，替换各页面重复的 inline 报错 JSX。
// 用户前端无管理员/运营角色与权限等级，因此 403 不再解读为「权限不足」，
// 而视为「会话失效」（令牌无效/过期），与 401 同样引导重新登录。
// - unauthorized(401) / forbidden(403)：未登录或会话失效 → 「请先登录」+ 登录入口
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

  if (kind === "unauthorized" || kind === "forbidden") {
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
