import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

interface NavEntry {
  key: string;
  label: string;
  href: string;
  icon?: string;
  children?: { label: string; href: string }[];
}

const NAV: NavEntry[] = [
  {
    key: "overview",
    label: "总览",
    href: "/admin/dashboard",
    children: [
      { label: "管理总览", href: "#/admin/dashboard" },
      { label: "审计日志", href: "#/admin/audit" },
    ],
  },
  {
    key: "users",
    label: "用户与账户",
    href: "#/admin/users",
    children: [
      { label: "用户管理", href: "#/admin/users" },
      { label: "KYC 审核", href: "#/admin/kyc" },
    ],
  },
  {
    key: "trade",
    label: "交易",
    href: "#/admin/orders",
    children: [
      { label: "订单管理", href: "#/admin/orders" },
      { label: "成交记录", href: "#/admin/trades" },
      { label: "交易对配置", href: "#/admin/symbols" },
      { label: "API 密钥", href: "#/admin/apikeys" },
    ],
  },
  {
    key: "funds",
    label: "资金",
    href: "#/admin/deposits",
    children: [
      { label: "充值记录", href: "#/admin/deposits" },
      { label: "提现审核", href: "#/admin/withdrawals" },
      { label: "充值地址", href: "#/admin/deposit-addresses" },
      { label: "账本对账", href: "#/admin/ledger" },
    ],
  },
  {
    key: "blockchain",
    label: "区块链",
    href: "#/admin/chains",
    children: [
      { label: "公链管理", href: "#/admin/chains" },
      { label: "币种管理", href: "#/admin/coins" },
    ],
  },
  {
    key: "ops",
    label: "运营",
    href: "#/admin/announcements",
    children: [
      { label: "公告管理", href: "#/admin/announcements" },
      { label: "通知管理", href: "#/admin/notifications" },
      { label: "服务健康", href: "#/admin/services" },
      { label: "理财资管", href: "#/admin/wealth" },
    ],
  },
  {
    key: "risk",
    label: "风控与监控",
    href: "#/admin/risk",
    children: [
      { label: "风控总览", href: "#/admin/risk" },
      { label: "期货管理", href: "#/admin/futures" },
    ],
  },
  {
    key: "aux",
    label: "扩展",
    href: "#/admin/lending",
    children: [
      { label: "借贷管理", href: "#/admin/lending" },
      { label: "交易机器人", href: "#/admin/bots" },
      { label: "邀请返佣", href: "#/admin/referral" },
    ],
  },
  {
    key: "system",
    label: "系统",
    href: "#/admin/admins",
    children: [
      { label: "管理员", href: "#/admin/admins" },
      { label: "角色权限", href: "#/admin/roles" },
      { label: "个人设置", href: "#/admin/profile" },
    ],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() =>
    typeof location === "undefined" ? "" : location.hash.replace(/^#/, "").split("?")[0]
  );
  useEffect(() => {
    const on = () => setCurrent(location.hash.replace(/^#/, "").split("?")[0]);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 侧边栏 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 border-r border-border bg-panel transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-sm font-bold tracking-wide">Admin</span>
        </div>
        <nav className="max-h-[calc(100vh-52px)] overflow-y-auto p-2">
          {NAV.map((group) => (
            <div key={group.key} className="mb-1">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </div>
              {group.children?.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                    current === item.href.replace(/^#/, "")
                      ? "bg-accent/15 font-semibold text-accent"
                      : "text-muted hover:bg-panel-2 hover:text-foreground"
                  )}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 主内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-panel px-4">
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-panel-2 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="菜单"
          >
            <MenuIcon />
          </button>
          <span className="text-sm font-semibold">{t("page.dashboard")}</span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="#/home"
              className="rounded-lg px-2.5 py-1 text-xs text-muted hover:bg-panel-2 hover:text-foreground"
            >
              ← 返回用户端
            </a>
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
