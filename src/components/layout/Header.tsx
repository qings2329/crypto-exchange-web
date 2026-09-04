import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import { useI18n, LOCALES, type Locale } from "../../i18n";
import { api } from "../../api/client";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { UserMenu } from "./UserMenu";

// 导航项：用户前端无角色权限差异，所有已登录用户可见同一套导航。
const LINKS: { path: string; key: string; auth?: boolean }[] = [
  { path: "/home", key: "nav.home" },
  { path: "/trade", key: "nav.trade" },
  { path: "/margin", key: "nav.margin" },
  { path: "/futures", key: "nav.futures" },
  { path: "/markets", key: "nav.markets" },
  { path: "/otc", key: "nav.otc" },
  { path: "/wallet", key: "nav.wallet" },
  { path: "/lending", key: "nav.lending" },
  { path: "/launchpad", key: "nav.launchpad" },
  { path: "/bot", key: "nav.bot" },
  { path: "/copytrade", key: "nav.copytrade" },
  { path: "/referral", key: "nav.referral" },
  { path: "/help", key: "help.title" },
  { path: "/security", key: "nav.security", auth: true },
];

/**
 * 顶部导航（币安风格）：
 * - 吸顶 + 毛玻璃背景，底部 1px 分隔线；
 * - 品牌 Logo 使用币安黄；导航项为下划线式 Tab：激活项黄色加粗，非激活灰字无背景变化。
 */
export function Header() {
  const { uid } = useAuth();
  const { locale, setLocale } = useI18n();
  const { t } = useTranslation();
  const current = (location.hash.replace(/^#/, "") || "/home").split("?")[0];

  // 未读通知数：挂载拉取 + 路由切换时刷新（进入通知页后回到任意页都应更新红点）。
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api
        .userNotificationUnread()
        .then((d) => alive && setUnread(d.count))
        .catch(() => {});
    refresh();
    window.addEventListener("hashchange", refresh);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", refresh);
    };
  }, []);

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
          {LINKS.filter((l) => !l.auth || uid).map((l) => {
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
              <a
                href="#/notifications"
                aria-label={t("nav.notifications")}
                className="relative grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2/60 hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-sell px-1 text-[10px] font-bold leading-4 text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </a>
              <UserMenu />
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
const NATIVE_LABELS: Record<string, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  "zh-TW": "繁體中文",
  "ja-JP": "日本語",
};

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
      <Button variant="outline" size="sm" aria-label={t("lang.label")} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="lang-trigger" className="gap-1.5 hover:border-accent/60 hover:text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
        </svg>
        {current?.label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("size-3 transition-transform duration-200", open && "rotate-180")}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      {open && (
        <div
          data-testid="lang-dropdown"
          className="lang-dropdown absolute right-0 top-full z-50 mt-2 w-44 origin-top-right overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {t("lang.label")}
          </div>
          {LOCALES.map((lc) => {
            const active = lc.value === locale;
            return (
              <button
                key={lc.value}
                onClick={() => {
                  onChange(lc.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  active ? "bg-accent/10" : "hover:bg-panel-2/60"
                )}
              >
                <span className={cn("text-sm text-foreground", active && "font-semibold text-accent")}>{lc.label}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {NATIVE_LABELS[lc.value] !== lc.label && (
                    <span className="text-[11px] text-muted">{NATIVE_LABELS[lc.value]}</span>
                  )}
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5 text-accent">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
