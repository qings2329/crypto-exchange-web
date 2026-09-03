import { AdminHeader } from "../../components/admin/AdminUI";

export default function Wealth() {
  return (
    <div>
      <AdminHeader title="理财资管" />
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <div className="text-4xl">💰</div>
        <div className="mt-4 text-sm text-muted">
          理财资管数据接口暂未接入
        </div>
        <div className="mt-2 text-xs text-muted">
          理财产品、资管计划的管理功能尚未开放，敬请期待。
        </div>
      </div>
    </div>
  );
}
