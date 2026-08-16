import { ApiTable } from "../components/ApiTable";

// 合约：持仓、资金费率、指数价、钱包余额、提现记录。
export function Futures() {
  return (
    <div className="page">
      <h2>合约</h2>
      <ApiTable title="持仓" endpoint="/api/v1/futures/positions" empty="暂无持仓" />
      <ApiTable title="资金费率" endpoint="/api/v1/futures/funding" />
      <ApiTable title="指数价" endpoint="/api/v1/futures/index" />
      <ApiTable title="钱包余额" endpoint="/api/v1/futures/wallet/balance" />
      <ApiTable title="提现记录" endpoint="/api/v1/futures/wallet/withdraws" empty="暂无提现记录" />
    </div>
  );
}
