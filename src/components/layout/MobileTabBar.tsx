// 移动端底部 TabBar（币安 App 风格）：<768px 显示，桌面端隐藏。
// 四个一级入口：首页 / 行情 / 交易 / 资产；激活项币安黄 + 图标点亮。

import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

const ITEMS = [
  {
    path: "/home",
    key: "tab.home",
    icon: (
      <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />
    ),
  },
  {
    path: "/markets",
    key: "tab.markets",
    icon: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-8" />
        <path d="M22 20H2" />
      </>
    ),
  },
  {
    path: "/trade",
    key: "tab.trade",
    icon: (
      <>
        <path d="M4 17 9 11l4 3 7-8" />
        <path d="M15 6h5v5" />
      </>
    ),
  },
  {
    path: "/wallet",
    key: "tab.wallet",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M16 12.5h2" />
        <path d="M3 10h18" />
      </>
    ),
  },
] as const;

export function MobileTabBar() {
  const { t } = useTranslation();
  const current = (location.hash.replace(/^#/, "") || "/home").split("?")[0];

  return (
    <nav
      aria-label="mobile-tabbar"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map((item) => {
        // /trade 与 /futures 都归入「交易」
        const active =
          current === item.path ||
          (item.path === "/trade" && current.startsWith("/trade")) ||
          (item.path === "/trade" && current.startsWith("/futures"));
        return (
          <a
            key={item.path}
            href={`#${item.path}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-muted"
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2.2 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              {item.icon}
            </svg>
            {t(item.key)}
          </a>
        );
      })}
    </nav>
  );
}
