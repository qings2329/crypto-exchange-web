import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import { usePermission } from "../../lib/rbac";
import { useI18n, LOCALES, type Locale } from "../../i18n";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

// 导航项与所需最低角色（与业务路由保持一致，管理入口仅对运营/管理员可见）。
const LINKS: { path: string; key: string; role?: "operator" | "admin"; auth?: boolean }[] = [
  { path: "/home", key: "nav.home" },
  { path: "/trade", key: "nav.trade" },
  { path: "/futures", key: "nav.futures" },
  { path: "/markets", key: "nav.markets" },
  { path: "/wallet", key: "nav.wallet" },
  { path: "/lending", key: "nav.lending" },
  { path: "/wealth", key: "nav.wealth" },
  { path: "/earn", key: "nav.earn" },
  { path: "/launchpad", key: "nav.launchpad" },
  { path: "/bot", key: "nav.bot" },
  { path: "/referral", key: "nav.referral" },
  { path: "/security", key: "nav.security", auth: true },
];

/**
 * 顶部导航（币安风格）：
 * - 吸顶 + 毛玻璃背景，底部 1px 分隔线；
 * - 品牌 Logo 使用币安黄；导航项为下划线式 Tab：激活项黄色加粗，非激活灰字无背景变化。
 */
export function Header() {
  const { uid, logout } = useAuth();
  const { role, hasRole } = usePermission();
  const { locale, setLocale } = useI18n();
  const { t } = useTranslation();
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
          {LINKS.filter((l) => (!l.role || hasRole(l.role)) && (!l.auth || uid)).map((l) => {
            // 前缀匹配：/trade 重定向到 /trade/BTCUSDT 后仍保持高亮
            const active = current === l.path || current.startsWith(`${l.path}/`);
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
        </nav>

        {/* 右侧操作区 */}
        <div className="ml-auto flex items-center gap-2">
          <LanguageMenu locale={locale} onChange={setLocale} />

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
                {t("header.logout")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <a href="#/login">{t("header.login")}</a>
              </Button>
              <Button asChild size="sm">
                <a href="#/register">{t("header.register")}</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * 语言选择下拉菜单：当前语言触发器 + 四语言列表（激活项品牌黄 + ✓）。
 * 点击外部自动收起。
 */
function LanguageMenu({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = LOCALES.find((l) => l.value === locale);

  return (
    <div className="relative hidden sm:block" ref={ref} data-testid="lang-menu">
      <Button variant="outline" size="sm" aria-label={t("lang.label")} onClick={() => setOpen((o) => !o)} data-testid="lang-trigger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
        </svg>
        {current?.label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("size-3 transition-transform", open && "rotate-180")}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          {LOCALES.map((lc) => (
            <button
              key={lc.value}
              onClick={() => {
                onChange(lc.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-panel-2",
                lc.value === locale ? "font-semibold text-accent" : "text-muted"
              )}
            >
              {lc.label}
              {lc.value === locale && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
