import { useEffect, useState, lazy, Suspense } from "react";
import { AuthProvider } from "./lib/auth";
import { RequireRole, type Role } from "./lib/rbac";
import { ConfirmProvider } from "./components/Confirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider, MonitorToasts } from "./components/Toast";
import { I18nProvider } from "./i18n";
import { AppProviders } from "./components/providers";
import { Web3Provider } from "./components/web3/Web3Provider";
import { Layout } from "./components/layout/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";

// 路由级代码分割：各业务页面按需懒加载，首屏仅加载登录/注册等必要模块，
// 其余页面进入对应路由时才加载对应 chunk（见 README 性能优化）。
const Trade = lazy(() => import("./pages/Trade").then((m) => ({ default: m.Trade })));
const TradeHall = lazy(() => import("./pages/TradeHall").then((m) => ({ default: m.TradeHall })));
const SecurityCenter = lazy(() => import("./pages/SecurityCenter").then((m) => ({ default: m.SecurityCenter })));
const KycPage = lazy(() => import("./pages/KycPage").then((m) => ({ default: m.KycPage })));
const Markets = lazy(() => import("./pages/Markets").then((m) => ({ default: m.Markets })));
const Orders = lazy(() => import("./pages/Orders").then((m) => ({ default: m.Orders })));
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
const Lending = lazy(() => import("./pages/Lending").then((m) => ({ default: m.Lending })));
const BotGrid = lazy(() => import("./pages/BotGrid").then((m) => ({ default: m.BotGrid })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Audit = lazy(() => import("./pages/Audit").then((m) => ({ default: m.Audit })));
const Referral = lazy(() => import("./pages/Referral").then((m) => ({ default: m.Referral })));

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
  "/security": SecurityCenter,
  "/kyc": KycPage,
  "/markets": Markets,
  "/orders": Orders,
  "/announcements": Announcements,
  "/history": History,
  "/trade": Trade,
  "/wallet": Wallet,
  "/futures/manage": Futures,
  "/options": Options,
  "/otc": Otc,
  "/margin": Margin,
  "/wealth": Wealth,
  "/lending": Lending,
  "/bot": BotGrid,
  "/risk": Risk,
  "/notifications": Notifications,
  "/monitor": Monitor,
  "/settings": Settings,
  "/apikeys": ApiKeys,
  "/admin": Dashboard,
  "/audit": Audit,
  "/referral": Referral,
};

// 各页面所需的最低角色。缺省为 user（仅登录即可），运营/管理类页面提升为 operator/admin。
const PAGE_ROLES: Record<string, Role> = {
  "/otc": "operator",
  "/risk": "admin",
  "/notifications": "admin",
  "/monitor": "admin",
  "/options": "admin",
  "/margin": "admin",
  "/announcements": "admin",
  "/admin": "admin",
  "/audit": "admin",
};

// 公开页面白名单见 src/lib/routes.ts（与 api/client 的 401 处理共享）。
import { PUBLIC_PAGES } from "./lib/routes";

function Router() {
  const hash = useHash();
  const path = hash.replace(/^#/, "").split("?")[0];

  if (path === "/login") return <Login />;
  if (path === "/register") return <Register />;

  // /trade/:SYMBOL 与 /futures/:SYMBOL —— 交易大厅（现货 / 永续合约模式）
  // 全宽终端布局：不套 .content 容器，由 TradeHall 自管内边距
  // 注意排除固定子路径 /futures/manage（合约管理页）
  const hall = path.match(/^\/(trade|futures)\/([a-z0-9]{5,20})$/i);
  if (hall && path !== "/futures/manage") {
    const initialMode = hall[1].toLowerCase() === "futures" ? "perp" : "spot";
    return (
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<div className="page muted">{""}</div>}>
            <TradeHall symbol={hall[2].toUpperCase()} initialMode={initialMode} />
          </Suspense>
        </ErrorBoundary>
      </Layout>
    );
  }

  // /trade、/futures —— 重定向到默认交易对（合约=永续交易页）
  if (path === "/trade") {
    location.hash = "#/trade/BTCUSDT";
    return null;
  }
  if (path === "/futures") {
    location.hash = "#/futures/BTCUSDT";
    return null;
  }

  const Page = PAGES[path] ?? Home;
  const need = PAGE_ROLES[path] ?? "user";
  const isPublic = PUBLIC_PAGES.has(path);

  const content = (
    <ErrorBoundary>
      <Suspense fallback={<div className="page muted">{""}</div>}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <Layout>
      <div className="content">{isPublic ? content : <RequireRole role={need}>{content}</RequireRole>}</div>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Web3Provider>
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
        </Web3Provider>
      </AppProviders>
    </ErrorBoundary>
  );
}
