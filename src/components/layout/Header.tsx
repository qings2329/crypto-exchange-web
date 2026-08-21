import { useAuth } from "../../lib/auth";
import { usePermission } from "../../lib/rbac";
import { useI18n, LOCALES } from "../../i18n";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

// 导航项与所需最低角色（与业务路由保持一致，管理入口仅对运营/管理员可见）。
const LINKS: { path: string; key: string; role?: "operator" | "admin" }[] = [
  { path: "/home", key: "nav.home" },
  { path: "/trade", key: "nav.trade" },
  { path: "/wallet", key: "nav.wallet" },
  { path: "/lending", key: "nav.lending" },
  { path: "/wealth", key: "nav.wealth" },
  { path: "/bot", key: "nav.bot" },
  { path: "/referral", key: "nav.referral" },
  { path: "/history", key: "nav.history" },
];

/**
 * 顶部导航（币安风格）：
 * - 吸顶 + 毛玻璃背景，底部 1px 分隔线；
 * - 品牌 Logo 使用币安黄；导航项为下划线式 Tab：激活项黄色加粗，非激活灰字无背景变化。
 */
export function Header() {
  const { uid, logout } = useAuth();
  const { role, hasRole } = usePermission();
  const { t, locale, setLocale } = useI18n();
  const current = (location.hash.replace(/^#/, "") || "/home").split("?")[0];

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-6 px-4">
        {/* 品牌 */}
        <a href="#/home" className="flex items-center gap-2 text-[15px] font-bold tracking-wide text-accent">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-black text-black">C</span>
          CryptoExchange
        </a>

        {/* 主导航：下划线 Tab */}
        <nav className="hidden h-full flex-1 items-center gap-1 lg:flex">
          {LINKS.filter((l) => !l.role || hasRole(l.role)).map((l) => {
            const active = current === l.path;
            return (
              <a
                key={l.path}
                href={`#${l.path}`}
                className={cn(
                  "relative flex h-full items-center px-3 text-[13px] transition-colors",
                  active ? "font-bold text-accent" : "text-muted hover:text-foreground"
                )}
              >
                {t(l.key)}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
              </a>
            );
          })}
          {hasRole("admin") && (
            <a
              href="#/admin"
              className={cn(
                "relative flex h-full items-center px-3 text-[13px] transition-colors",
                current === "/admin" ? "font-bold text-accent" : "text-muted hover:text-foreground"
              )}
            >
              {t("nav.overview")}
            </a>
          )}
        </nav>

        {/* 右侧操作区 */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center rounded-lg border border-border p-0.5 sm:flex" role="group" aria-label={t("lang.label")}>
            {LOCALES.map((lc) => (
              <button
                key={lc.value}
                onClick={() => setLocale(lc.value)}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-xs transition-colors",
                  lc.value === locale ? "bg-panel-2 font-semibold text-foreground" : "text-muted hover:text-foreground"
                )}
              >
                {lc.label}
              </button>
            ))}
          </div>

          {uid ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                #{uid}
                {role && (
                  <span className="rounded-md bg-tag-bg px-1.5 py-0.5 text-[11px] font-medium text-accent">
                    {t(`nav.role.${role}`)}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                {t("nav.logout")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <a href="#/login">{t("login.title")}</a>
              </Button>
              <Button asChild size="sm">
                <a href="#/register">{t("register.title")}</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
