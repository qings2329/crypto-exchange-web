import { ApiTable } from "../components/ApiTable";
import { useI18n } from "../i18n";

// 审计日志：后台操作留痕，支持筛选/排序/分页/导出。
export function Audit() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h2>{t("page.audit")}</h2>
      <ApiTable
        title={t("audit.title")}
        endpoint="/api/v1/admin/audit"
        searchable
        sortable
        pageSize={20}
        empty={t("audit.empty")}
      />
    </div>
  );
}
