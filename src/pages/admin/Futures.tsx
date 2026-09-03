import { AdminHeader } from "../../components/admin/AdminUI";
import { useI18n } from "../../i18n";

export default function Futures() {
  const { t } = useI18n();
  return (
    <div>
      <AdminHeader title="期货管理" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted">未接入接口</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-muted">—</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted">未接入接口</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-muted">—</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted">未接入接口</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-muted">—</div>
        </div>
      </div>
      <div className="muted mt-6 py-12 text-center">
        期货资金/强平管理接口暂未接入
        <div className="mt-2 text-xs text-muted">
          期货相关风控数据请前往{" "}
          <a href="#/admin/risk" className="text-accent underline underline-offset-4">
            风控中心
          </a>{" "}
          查看
        </div>
      </div>
      <div className="sr-only">{t("common.noData")}</div>
    </div>
  );
}
