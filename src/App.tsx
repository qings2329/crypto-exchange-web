import { useEffect, useState, lazy, Suspense } from "react";
import { AuthProvider } from "./lib/auth";
import { RequireRole } from "./lib/rbac";
import { ConfirmProvider } from "./components/Confirm";
import { SecureActionProvider } from "./components/security/SecureActionProvider";
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
const OtcPage = lazy(() => import("./pages/OtcPage").then((m) => ({ default: m.OtcPage })));
const EarnPage = lazy(() => import("./pages/EarnPage").then((m) => ({ default: m.EarnPage })));
const LaunchpadPage = lazy(() => import("./pages/LaunchpadPage").then((m) => ({ default: m.LaunchpadPage })));
const Markets = lazy(() => import("./pages/Markets").then((m) => ({ default: m.Markets })));
const Orders = lazy(() => import("./pages/Orders").then((m) => ({ default: m.Orders })));
const Wallet = lazy(() => import("./pages/Wallet").then((m) => ({ default: m.Wallet })));
const Wealth = lazy(() => import("./pages/Wealth").then((m) => ({ default: m.Wealth })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ApiKeys = lazy(() => import("./pages/ApiKeys").then((m) => ({ default: m.ApiKeys })));
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const Announcements = lazy(() => import("./pages/Announcements"));
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const Lending = lazy(() => import("./pages/Lending").then((m) => ({ default: m.Lending })));
const BotGrid = lazy(() => import("./pages/BotGrid").then((m) => ({ default: m.BotGrid })));
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
  "/otc": OtcPage,
  "/earn": EarnPage,
  "/launchpad": LaunchpadPage,
  "/wealth": Wealth,
  "/lending": Lending,
  "/bot": BotGrid,
  "/settings": Settings,
  "/apikeys": ApiKeys,
  "/referral": Referral,
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
  const hall = path.match(/^\/(trade|futures)\/([a-z0-9]{5,20})$/i);
  if (hall) {
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
      <div className="content">{isPublic ? content : <RequireRole role="user">{content}</RequireRole>}</div>
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
                  <SecureActionProvider>
                    <Router />
                  </SecureActionProvider>
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
