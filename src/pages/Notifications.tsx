import { ApiTable } from "../components/ApiTable";

// 通知：全量通知（管理视图）。
export function Notifications() {
  return (
    <div className="page">
      <h2>通知</h2>
      <ApiTable title="全部通知" endpoint="/api/v1/notification/admin/list" empty="暂无通知" />
    </div>
  );
}
