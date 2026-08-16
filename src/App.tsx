import { useEffect, useState } from "react";
import { AuthProvider } from "./lib/auth";
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

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/trade");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/trade");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const PAGES: Record<string, () => JSX.Element> = {
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
};

function Router() {
  const hash = useHash();
  const path = hash.replace(/^#/, "").split("?")[0];

  if (path === "/login") return <Login />;
  if (path === "/register") return <Register />;

  // 需登录的受保护页面：无 token 则跳转登录。
  if (!localStorage.getItem("cx_access_token")) {
    location.hash = "/login";
    return <Login />;
  }

  const Page = PAGES[path] ?? Trade;
  return (
    <>
      <NavBar />
      <main className="content">
        <Page />
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
