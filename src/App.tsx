import { useEffect, useState } from "react";
import { AuthProvider } from "./lib/auth";
import { RequireRole, type Role } from "./lib/rbac";
import { ConfirmProvider } from "./components/Confirm";
import { I18nProvider } from "./i18n";
import { NavBar } from "./components/NavBar";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Trade } from "./pages/Trade";
import { Wallet } from "./pages/Wallet";
import { Futures } from "./pages/Futures";
import { Options } from "./pages/Options";
import { Otc } from "./pages/Otc";
import { Margin } from "./pages/Margin";
import { Wealth } from "./pages/Wealth";
import { Risk } from "./pages/Risk";
import { Notifications } from "./pages/Notifications";
import { Monitor } from "./pages/Monitor";
import { Settings } from "./pages/Settings";
import { ApiKeys } from "./pages/ApiKeys";
import { Home } from "./pages/Home";
import { Announcements } from "./pages/Announcements";
import { History } from "./pages/History";
import { Dashboard } from "./pages/Dashboard";
import { Audit } from "./pages/Audit";

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/home");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/home");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const PAGES: Record<string, () => JSX.Element> = {
  "/home": Home,
  "/announcements": Announcements,
  "/history": History,
  "/trade": Trade,
  "/wallet": Wallet,
  "/futures": Futures,
  "/options": Options,
  "/otc": Otc,
  "/margin": Margin,
  "/wealth": Wealth,
  "/risk": Risk,
  "/notifications": Notifications,
  "/monitor": Monitor,
  "/settings": Settings,
  "/apikeys": ApiKeys,
  "/admin": Dashboard,
  "/audit": Audit,
};

// 各页面所需的最低角色。缺省为 user（仅登录即可），运营/管理类页面提升为 operator/admin。
const PAGE_ROLES: Record<string, Role> = {
  "/otc": "operator",
  "/risk": "admin",
  "/notifications": "admin",
  "/monitor": "admin",
  "/options": "admin",
  "/futures": "admin",
  "/margin": "admin",
  "/announcements": "admin",
  "/admin": "admin",
  "/audit": "admin",
};

function Router() {
  const hash = useHash();
  const path = hash.replace(/^#/, "").split("?")[0];

  if (path === "/login") return <Login />;
  if (path === "/register") return <Register />;

  const Page = PAGES[path] ?? Home;
  const need = PAGE_ROLES[path] ?? "user";

  return (
    <>
      <NavBar />
      <main className="content">
        <RequireRole role={need}>
          <Page />
        </RequireRole>
      </main>
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ConfirmProvider>
          <Router />
        </ConfirmProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
