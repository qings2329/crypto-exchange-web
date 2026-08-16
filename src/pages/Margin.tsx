import { ApiTable } from "../components/ApiTable";

// 杠杆：我的账户、全部账户、强平价。
export function Margin() {
  return (
    <div className="page">
      <h2>杠杆</h2>
      <ApiTable title="我的账户" endpoint="/api/v1/margin/account" />
      <ApiTable title="全部账户" endpoint="/api/v1/margin/accounts" empty="暂无账户" />
      <ApiTable title="强平价" endpoint="/api/v1/margin/liq-price" />
    </div>
  );
}
