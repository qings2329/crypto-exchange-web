import { EmptyState } from "../../components/admin/AdminUI";

export default function Kyc() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">KYC 审核</h2>
      </div>
      <div className="rounded-xl border border-border bg-card p-8">
        <EmptyState text="KYC 审核数据接口暂未接入" />
        <p className="mt-2 text-center text-xs text-muted">
          KYC 审核功能请通过「用户管理」页面操作用户状态。
        </p>
      </div>
    </div>
  );
}
