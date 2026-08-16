import { ApiTable } from "../components/ApiTable";

// OTC 场外交易：广告、订单、交易对手。
export function Otc() {
  return (
    <div className="page">
      <h2>OTC 场外交易</h2>
      <ApiTable title="广告" endpoint="/api/v1/otc/advertisements" empty="暂无广告" />
      <ApiTable title="我的订单" endpoint="/api/v1/otc/orders" empty="暂无订单" />
      <ApiTable title="交易对手" endpoint="/api/v1/otc/counterparties" empty="暂无交易对手" />
    </div>
  );
}
