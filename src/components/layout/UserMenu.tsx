import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type UserProfile } from "../../api/client";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";

// 顶部用户菜单（币安风格）：头像 + 下拉，含个人中心/设置/安全/帮助/通知与退出登录。
// - 头像取昵称首字，无昵称时回退到 #uid；拉取 /user/me 补全资料；
// - 点击外部自动收起，Esc 关闭；菜单为浮层，不影响路由。

interface MenuItem {
  key: string;
  labelKey: string;
  href: string;
  danger?: boolean;
}

const ITEMS: MenuItem[] = [
  { key: "settings", labelKey: "nav.settings", href: "#/settings" },
  { key: "security", labelKey: "nav.security", href: "#/security" },
  { key: "help", labelKey: "help.title", href: "#/help" },
  { key: "notifications", labelKey: "nav.notifications", href: "#/notifications" },
];

function initials(p: UserProfile | null, uid: string | null): string {
  const base = p?.nickname || p?.email || uid || "";
  const ch = base.trim().charAt(0);
  return ch ? ch.toUpperCase() : "#";
}

export function UserMenu() {
  const { t } = useTranslation();
  const { uid, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .userMe()
      .then((me) => alive && setProfile(me))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  const name = profile?.nickname || profile?.email || (uid ? `#${uid}` : "");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.settings")}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FCD535] to-[#F0B90B] text-[13px] font-bold text-black outline-none ring-offset-2 ring-offset-background transition-transform hover:scale-105"
      >
        {initials(profile, uid)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FCD535] to-[#F0B90B] text-sm font-bold text-black">
              {initials(profile, uid)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
              {uid && <div className="truncate text-[11px] text-muted">UID #{uid}</div>}
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          <ul role="menu">
            {ITEMS.map((it) => (
              <li key={it.key} role="none">
                <a
                  role="menuitem"
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-foreground transition-colors hover:bg-panel-2/60"
                >
                  {t(it.labelKey)}
                </a>
              </li>
            ))}
          </ul>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
              "text-sell hover:bg-sell/10"
            )}
          >
            {t("header.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
