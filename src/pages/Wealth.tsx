import { ApiTable } from "../components/ApiTable";

// 理财资管：产品、我的持仓。
export function Wealth() {
  return (
    <div className="page">
      <h2>理财资管</h2>
      <ApiTable title="产品" endpoint="/api/v1/wealth/products" empty="暂无产品" />
      <ApiTable title="我的持仓" endpoint="/api/v1/wealth/holdings" empty="暂无持仓" />
    </div>
  );
}
