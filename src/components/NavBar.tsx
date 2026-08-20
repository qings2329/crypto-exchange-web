import { useAuth } from "../lib/auth";
import { usePermission } from "../lib/rbac";
import { useI18n, LOCALES } from "../i18n";

// 导航项与所需最低角色（缺省 user）。仅保留用户端核心导航，管理入口移至用户菜单。
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

export function NavBar() {
  const { uid, logout } = useAuth();
  const { role, hasRole } = usePermission();
  const { t, locale, setLocale } = useI18n();
  const current = (location.hash.replace(/^#/, "") || "/trade").split("?")[0];

  return (
    <nav className="navbar">
      <a className="brand" href="#/home">
        CryptoExchange
      </a>
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
        {(hasRole("admin") || hasRole("operator")) && (
          <a
            href="#/admin"
            className={current === "/admin" ? "active" : ""}
          >
            {t("nav.overview")}
          </a>
        )}
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
        {uid ? (
          <>
            <span className="uid">
              #{uid}
              {role && <span className="role-badge">{t(`nav.role.${role}`)}</span>}
            </span>
            <button className="logout" onClick={logout}>
              {t("nav.logout")}
            </button>
          </>
        ) : (
          <>
            <a href="#/login" className="btn-outline" style={{ padding: "6px 16px", fontSize: 13 }}>
              {t("login.title")}
            </a>
            <a href="#/register" className="btn-primary" style={{ padding: "6px 16px", fontSize: 13 }}>
              {t("register.title")}
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
