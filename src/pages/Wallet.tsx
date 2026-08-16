import { ApiTable } from "../components/ApiTable";

// 钱包：当前后端以合约钱包余额接口为统一资产视图（现货余额经撮合引擎内存态，无独立 HTTP 接口）。
export function Wallet() {
  return (
    <div className="page">
      <h2>钱包资产</h2>
      <ApiTable title="余额" endpoint="/api/v1/futures/wallet/balance" />
      <ApiTable title="提现记录" endpoint="/api/v1/futures/wallet/withdraws" empty="暂无提现记录" />
    </div>
  );
}
