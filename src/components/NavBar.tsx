import { useAuth } from "../lib/auth";

const LINKS: { path: string; label: string }[] = [
  { path: "/trade", label: "现货" },
  { path: "/wallet", label: "钱包" },
  { path: "/futures", label: "合约" },
  { path: "/options", label: "期权" },
  { path: "/otc", label: "OTC" },
  { path: "/margin", label: "杠杆" },
  { path: "/wealth", label: "理财" },
  { path: "/risk", label: "风控" },
  { path: "/notifications", label: "通知" },
  { path: "/monitor", label: "监控" },
];

export function NavBar() {
  const { uid, logout } = useAuth();
  const current = (location.hash.replace(/^#/, "") || "/trade").split("?")[0];

  return (
    <nav className="navbar">
      <span className="brand">crypto-exchange</span>
      <div className="links">
        {LINKS.map((l) => (
          <a
            key={l.path}
            href={`#${l.path}`}
            className={current === l.path ? "active" : ""}
          >
            {l.label}
          </a>
        ))}
      </div>
      <div className="right">
        {uid && <span className="uid">用户 #{uid}</span>}
        <button className="logout" onClick={logout}>
          退出
        </button>
      </div>
    </nav>
  );
}
