import { useEffect, useState, lazy, Suspense } from "react";
import { AuthProvider } from "./lib/auth";
import { RequireRole, type Role } from "./lib/rbac";
import { ConfirmProvider } from "./components/Confirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider, MonitorToasts } from "./components/Toast";
import { I18nProvider } from "./i18n";
import { NavBar } from "./components/NavBar";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";

// 路由级代码分割：各业务页面按需懒加载，首屏仅加载登录/注册等必要模块，
// 其余页面进入对应路由时才加载对应 chunk（见 README 性能优化）。
const Trade = lazy(() => import("./pages/Trade").then((m) => ({ default: m.Trade })));
const Wallet = lazy(() => import("./pages/Wallet").then((m) => ({ default: m.Wallet })));
const Futures = lazy(() => import("./pages/Futures").then((m) => ({ default: m.Futures })));
const Options = lazy(() => import("./pages/Options").then((m) => ({ default: m.Options })));
const Otc = lazy(() => import("./pages/Otc").then((m) => ({ default: m.Otc })));
const Margin = lazy(() => import("./pages/Margin").then((m) => ({ default: m.Margin })));
const Wealth = lazy(() => import("./pages/Wealth").then((m) => ({ default: m.Wealth })));
const Risk = lazy(() => import("./pages/Risk").then((m) => ({ default: m.Risk })));
const Notifications = lazy(() => import("./pages/Notifications").then((m) => ({ default: m.Notifications })));
const Monitor = lazy(() => import("./pages/Monitor").then((m) => ({ default: m.Monitor })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ApiKeys = lazy(() => import("./pages/ApiKeys").then((m) => ({ default: m.ApiKeys })));
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const Announcements = lazy(() => import("./pages/Announcements").then((m) => ({ default: m.Announcements })));
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Audit = lazy(() => import("./pages/Audit").then((m) => ({ default: m.Audit })));

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/home");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/home");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const PAGES: Record<string, React.ComponentType> = {
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
          <ErrorBoundary>
            <Suspense fallback={<div className="page muted">{""}</div>}>
              <Page />
            </Suspense>
          </ErrorBoundary>
        </RequireRole>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AuthProvider>
          <ConfirmProvider>
            <ToastProvider>
              <Router />
              <MonitorToasts />
            </ToastProvider>
          </ConfirmProvider>
        </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
