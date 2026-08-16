import { useState } from "react";
import { api } from "../api/client";
import { ApiTable } from "../components/ApiTable";

const ADS_EP = "/api/v1/otc/advertisements";

// OTC 场外交易：发布广告表单 + 广告列表 + 我的订单 + 交易对手。
export function Otc() {
  // 发布广告表单
  const [showForm, setShowForm] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [asset, setAsset] = useState("");
  const [fiat, setFiat] = useState("");
  const [price, setPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [payMethods, setPayMethods] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  // 广告列表刷新键：发布成功后自增触发 ApiTable 重新拉取
  const [adsReload, setAdsReload] = useState(0);

  const submitAd = async () => {
    setFormMsg("");
    const p = parseFloat(price);
    const min = parseFloat(minAmount);
    const max = parseFloat(maxAmount);
    if (!asset.trim() || !fiat.trim()) {
      setFormMsg("请填写交易币种与法币");
      return;
    }
    if (!p || p <= 0) {
      setFormMsg("请填写正确单价");
      return;
    }
    if (!min || min <= 0 || !max || max < min) {
      setFormMsg("数量范围不合法（最小>0 且 最大≥最小）");
      return;
    }
    const methods = payMethods
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (methods.length === 0) {
      setFormMsg("请至少填写一种支付方式");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.otcCreateAd({
        side,
        asset: asset.trim(),
        fiat: fiat.trim(),
        price: p,
        min_amount: min,
        max_amount: max,
        payment_methods: methods,
        remark: remark.trim() || undefined,
      });
      setFormMsg(`已发布，广告号 ${r.ad_id}`);
      setShowForm(false);
      setAsset("");
      setFiat("");
      setPrice("");
      setMinAmount("");
      setMaxAmount("");
      setPayMethods("");
      setRemark("");
      setAdsReload((k) => k + 1);
    } catch (e) {
      setFormMsg(`发布失败：${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>OTC 场外交易</h2>
        <button className="refresh" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "收起" : "发布广告"}
        </button>
      </div>

      {showForm && (
        <div className="orderform wform">
          <label>
            方向
            <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
              <option value="sell">我卖币</option>
              <option value="buy">我买币</option>
            </select>
          </label>
          <label>
            交易币种
            <input value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="如 USDT" />
          </label>
          <label>
            法币
            <input value={fiat} onChange={(e) => setFiat(e.target.value)} placeholder="如 CNY" />
          </label>
          <label>
            单价（{fiat || "法币"}/币）
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            最小数量
            <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            最大数量
            <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            支付方式（逗号分隔）
            <input
              value={payMethods}
              onChange={(e) => setPayMethods(e.target.value)}
              placeholder="支付宝, 微信, 银行卡"
            />
          </label>
          <label>
            备注（可选）
            <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="交易时间 / 留言" />
          </label>
          <button className="submit" onClick={submitAd} disabled={submitting}>
            {submitting ? "提交中…" : "发布广告"}
          </button>
          {formMsg && (
            <div className={formMsg.startsWith("发布失败") ? "error" : "ok"}>{formMsg}</div>
          )}
        </div>
      )}

      <ApiTable title="广告" endpoint={ADS_EP} reloadKey={adsReload} empty="暂无广告" />
      <ApiTable title="我的订单" endpoint="/api/v1/otc/orders" empty="暂无订单" />
      <ApiTable title="交易对手" endpoint="/api/v1/otc/counterparties" empty="暂无交易对手" />
    </div>
  );
}
