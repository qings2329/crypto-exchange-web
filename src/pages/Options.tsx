import { ApiTable } from "../components/ApiTable";

// 期权：合约列表、我的持仓、全量持仓（管理视图）。
export function Options() {
  return (
    <div className="page">
      <h2>期权</h2>
      <ApiTable title="合约" endpoint="/api/v1/options/contracts" empty="暂无合约" />
      <ApiTable title="我的持仓" endpoint="/api/v1/options/positions" empty="暂无持仓" />
      <ApiTable title="全量持仓（管理）" endpoint="/api/v1/options/admin/positions" empty="暂无持仓" />
    </div>
  );
}
