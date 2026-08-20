import { useAuth } from "../lib/auth";
import { usePermission } from "../lib/rbac";
import { useI18n, LOCALES } from "../i18n";

// 导航项与所需最低角色（缺省 user）。与 App.tsx 的 PAGE_ROLES 保持一致即可。
// label 用 i18n key，渲染时通过 t() 取对应语言文案。
const LINKS: { path: string; key: string; role?: "operator" | "admin" }[] = [
  { path: "/home", key: "nav.home" },
  { path: "/admin", key: "nav.overview", role: "admin" },
  { path: "/audit", key: "nav.audit", role: "admin" },
  { path: "/announcements", key: "nav.announcements", role: "admin" },
  { path: "/history", key: "nav.history" },
  { path: "/trade", key: "nav.trade" },
  { path: "/wallet", key: "nav.wallet" },
  { path: "/futures", key: "nav.futures", role: "admin" },
  { path: "/options", key: "nav.options", role: "admin" },
  { path: "/otc", key: "nav.otc", role: "operator" },
  { path: "/margin", key: "nav.margin", role: "admin" },
  { path: "/wealth", key: "nav.wealth" },
  { path: "/lending", key: "nav.lending" },
  { path: "/bot", key: "nav.bot" },
  { path: "/referral", key: "nav.referral" },
  { path: "/risk", key: "nav.risk", role: "admin" },
  { path: "/notifications", key: "nav.notifications", role: "admin" },
  { path: "/monitor", key: "nav.monitor", role: "admin" },
  { path: "/settings", key: "nav.settings" },
  { path: "/apikeys", key: "nav.apikeys" },
];

export function NavBar() {
  const { uid, logout } = useAuth();
  const { role, hasRole } = usePermission();
  const { t, locale, setLocale } = useI18n();
  const current = (location.hash.replace(/^#/, "") || "/trade").split("?")[0];

  return (
    <nav className="navbar">
      <span className="brand">crypto-exchange</span>
      <div className="links">
        {LINKS.filter((l) => !l.role || hasRole(l.role)).map((l) => (
          <a
            key={l.path}
            href={`#${l.path}`}
            className={current === l.path ? "active" : ""}
          >
            {t(l.key)}
          </a>
        ))}
      </div>
      <div className="right">
        <div className="lang-switch" role="group" aria-label={t("lang.label")}>
          {LOCALES.map((lc) => (
            <button
              key={lc.value}
              className={lc.value === locale ? "lang active" : "lang"}
              onClick={() => setLocale(lc.value)}
            >
              {lc.label}
            </button>
          ))}
        </div>
        {uid && (
          <span className="uid">
            {t("nav.user", { uid })}
            {role && <span className="role-badge">{t(`nav.role.${role}`)}</span>}
          </span>
        )}
        <button className="logout" onClick={logout}>
          {t("nav.logout")}
        </button>
      </div>
    </nav>
  );
}
