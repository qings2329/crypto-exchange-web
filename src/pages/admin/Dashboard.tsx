import { adminApi, adminToken } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { AdminHeader, StatCard, LoadingState } from "../../components/admin/AdminUI";

const fmtNum = (n: number) => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
};

export default function Dashboard() {
  const { data, loading, err, reload } = useAdminData(() => adminApi.overview());

  const logout = () => {
    adminToken.clear();
    location.hash = "/admin/login";
  };

  return (
    <div>
      <AdminHeader
        title="管理总览"
        actions={
          <button className="btn outline" onClick={logout}>
            退出登录
          </button>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="注册用户" value={fmtNum(data.users_total)} accent />
            <StatCard label="今日新增" value={fmtNum(data.users_today)} />
            <StatCard
              label="24h 交易额"
              value={fmtNum(data.trade_volume_24h)}
              sub="≈ USDT"
            />
            <StatCard label="24h 订单数" value={fmtNum(data.orders_24h)} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="待审提现" value={fmtNum(data.pending_withdraws)} />
            <StatCard label="待处理风控" value={fmtNum(data.pending_risk_events)} />
            <StatCard label="未结争议" value={fmtNum(data.open_disputes)} />
            <StatCard label="在线用户" value={fmtNum(data.online_users)} />
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold">快捷操作</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <QuickLink href="#/admin/withdrawals" label="提现审核" />
              <QuickLink href="#/admin/kyc" label="KYC 审核" />
              <QuickLink href="#/admin/risk" label="风控中心" />
              <QuickLink href="#/admin/users" label="用户管理" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent"
    >
      {label}
    </a>
  );
}
