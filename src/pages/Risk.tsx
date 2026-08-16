import { ApiTable } from "../components/ApiTable";

// 风控：规则、黑名单、事件。
export function Risk() {
  return (
    <div className="page">
      <h2>风控</h2>
      <ApiTable title="规则" endpoint="/api/v1/risk/rules" empty="暂无规则" />
      <ApiTable title="黑名单" endpoint="/api/v1/risk/blacklist" empty="暂无黑名单" />
      <ApiTable title="事件" endpoint="/api/v1/risk/events" empty="暂无事件" />
    </div>
  );
}
