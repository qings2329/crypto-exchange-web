import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type OtcOrderStatus } from "../api/client";
import { ApiTable } from "../components/ApiTable";

const ADS_EP = "/api/v1/otc/advertisements";
const ORDERS_EP = "/api/v1/otc/orders";
const PAGE_SIZES = [10, 20, 50];

type AdRow = Record<string, unknown>;

// 读取广告/订单 id（兼容 id / ad_id / order_id）
function rowId(row: AdRow, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n !== null) return n;
  }
  return null;
}
const adId = (ad: AdRow) => rowId(ad, ["id", "ad_id"]);
const orderId = (o: AdRow) => rowId(o, ["id", "order_id"]);

function cell(row: AdRow, key: string): string {
  const v = row[key];
  if (v === null || v === undefined || v === "") return "--";
  if (Array.isArray(v)) return v.join("、");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
const normStatus = (s: unknown) => String(s ?? "").toLowerCase();

// 广告表格：固定列 + 操作列（一键下单）
function AdsTable({ rows, onOrder }: { rows: AdRow[]; onOrder: (ad: AdRow) => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>方向</th>
            <th>币种</th>
            <th>法币</th>
            <th>单价</th>
            <th>数量区间</th>
            <th>支付</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ad, i) => {
            const id = adId(ad);
            const side = normStatus(ad["side"]);
            const sideLabel = side === "buy" ? "买币" : side === "sell" ? "卖币" : cell(ad, "side");
            return (
              <tr key={id ?? i}>
                <td>
                  <span className={side === "buy" ? "otc-side buy" : side === "sell" ? "otc-side sell" : ""}>
                    {sideLabel}
                  </span>
                </td>
                <td>{cell(ad, "asset")}</td>
                <td>{cell(ad, "fiat")}</td>
                <td>{cell(ad, "price")}</td>
                <td>
                  {cell(ad, "min_amount")} ~ {cell(ad, "max_amount")}
                </td>
                <td>{cell(ad, "payment_methods")}</td>
                <td>
                  <button className="link-btn" disabled={id === null} onClick={() => onOrder(ad)}>
                    下单
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- 订单状态机 ----
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  completed: "已完成",
  cancelled: "已取消",
  appeal: "申诉中",
};
const ORDER_TRANSITIONS: Record<string, { to: OtcOrderStatus; label: string }[]> = {
  pending: [
    { to: "paid", label: "标记已付款" },
    { to: "cancelled", label: "取消" },
  ],
  paid: [
    { to: "completed", label: "确认放行" },
    { to: "appeal", label: "申诉" },
  ],
  appeal: [
    { to: "completed", label: "仲裁放行" },
    { to: "cancelled", label: "仲裁取消" },
  ],
};

// 订单表格：状态徽标 + 按状态机展示可执行的流转操作
function OrdersTable({
  rows,
  onTransition,
}: {
  rows: AdRow[];
  onTransition: (id: number, to: OtcOrderStatus) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>方向</th>
            <th>币种</th>
            <th>数量</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o, i) => {
            const id = orderId(o);
            const st = normStatus(o["status"]);
            const label = ORDER_STATUS_LABEL[st] ?? (o["status"] != null ? String(o["status"]) : "未知");
            const cls = ORDER_STATUS_LABEL[st] ? st : "unknown";
            const side = normStatus(o["side"]);
            const sideLabel = side === "buy" ? "买币" : side === "sell" ? "卖币" : cell(o, "side");
            const acts = ORDER_TRANSITIONS[st] ?? [];
            return (
              <tr key={id ?? i}>
                <td>{id ?? "--"}</td>
                <td>{sideLabel}</td>
                <td>{cell(o, "asset")}</td>
                <td>{cell(o, "amount")}</td>
                <td>
                  <span className={`ostatus ${cls}`}>{label}</span>
                </td>
                <td>
                  {acts.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="row-actions">
                      {acts.map((a) => (
                        <button
                          key={a.to}
                          className="link-btn"
                          disabled={id === null}
                          onClick={() => id !== null && onTransition(id, a.to)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// OTC 场外交易：发布广告 + 广告列表（筛选/分页/分Tab）+ 一键下单 + 订单状态机 + 交易对手。
export function Otc() {
  // ---- 广告列表（客户端筛选 + 分页 + 分Tab）----
  const [ads, setAds] = useState<unknown>(undefined);
  const [adsErr, setAdsErr] = useState("");
  const [adsLoading, setAdsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [sideTab, setSideTab] = useState<"all" | "buy" | "sell">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const loadAds = useCallback(async () => {
    setAdsLoading(true);
    try {
      const d = await api.get(ADS_EP);
      setAds(d);
      setAdsErr("");
    } catch (e) {
      setAdsErr((e as Error).message);
    } finally {
      setAdsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const filtered = useMemo(() => {
    if (!Array.isArray(ads)) return ads;
    const kw = filter.trim().toLowerCase();
    return (ads as unknown[]).filter((row) => {
      const r = row as AdRow | null;
      if (sideTab !== "all" && normStatus(r?.["side"]) !== sideTab) return false;
      if (kw && !JSON.stringify(row).toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [ads, filter, sideTab]);

  const total = Array.isArray(filtered) ? filtered.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = Array.isArray(filtered)
    ? (filtered as unknown[]).slice(safePage * pageSize, safePage * pageSize + pageSize)
    : filtered;

  // ---- 发布广告表单 ----
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
      setPage(0);
      loadAds();
    } catch (e) {
      setFormMsg(`发布失败：${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 一键下单 ----
  const [selectedAd, setSelectedAd] = useState<AdRow | null>(null);
  const [orderAmount, setOrderAmount] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [ordersReload, setOrdersReload] = useState(0);

  const submitOrder = async () => {
    if (!selectedAd) return;
    const id = adId(selectedAd);
    if (id === null) {
      setOrderMsg("广告缺少 id，无法下单");
      return;
    }
    const amt = parseFloat(orderAmount);
    if (!amt || amt <= 0) {
      setOrderMsg("请输入正确数量");
      return;
    }
    const min = Number(selectedAd["min_amount"]);
    const max = Number(selectedAd["max_amount"]);
    if (Number.isFinite(min) && amt < min) {
      setOrderMsg(`数量不能低于 ${min}`);
      return;
    }
    if (Number.isFinite(max) && amt > max) {
      setOrderMsg(`数量不能高于 ${max}`);
      return;
    }
    setOrderSubmitting(true);
    try {
      const r = await api.otcPlaceOrder({ ad_id: id, amount: amt });
      setOrderMsg(`已下单，订单号 ${r.order_id}`);
      setSelectedAd(null);
      setOrderAmount("");
      setOrdersReload((k) => k + 1);
    } catch (e) {
      setOrderMsg(`下单失败：${(e as Error).message}`);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const adPrice = selectedAd ? Number(selectedAd["price"]) : NaN;
  const orderTotal = Number.isFinite(adPrice) && parseFloat(orderAmount) > 0
    ? (adPrice as number) * parseFloat(orderAmount)
    : NaN;

  // ---- 我的订单（状态机流转）----
  const [orders, setOrders] = useState<unknown>(undefined);
  const [ordersErr, setOrdersErr] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const d = await api.get(ORDERS_EP);
      setOrders(d);
      setOrdersErr("");
    } catch (e) {
      setOrdersErr((e as Error).message);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, ordersReload]);

  const transitionOrder = async (id: number, to: OtcOrderStatus) => {
    try {
      await api.otcUpdateOrderStatus(id, to);
      loadOrders();
    } catch (e) {
      setOrdersErr((e as Error).message);
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

      {selectedAd && (
        <div className="orderform wform">
          <div className="order-head">
            <strong>下单</strong>
            <button className="link-btn" onClick={() => setSelectedAd(null)}>
              关闭
            </button>
          </div>
          <div className="order-meta">
            {normStatus(selectedAd["side"]) === "buy" ? "买币" : "卖币"} · {cell(selectedAd, "asset")} · 单价{" "}
            {cell(selectedAd, "price")} {cell(selectedAd, "fiat")}（{cell(selectedAd, "min_amount")} ~{" "}
            {cell(selectedAd, "max_amount")}）
          </div>
          <label>
            数量
            <input
              value={orderAmount}
              onChange={(e) => setOrderAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>
          <div className="order-total">
            预估总额：{Number.isFinite(orderTotal) ? orderTotal.toLocaleString() : "--"}{" "}
            {cell(selectedAd, "fiat")}
          </div>
          <button className="submit" onClick={submitOrder} disabled={orderSubmitting}>
            {orderSubmitting ? "提交中…" : "确认下单"}
          </button>
          {orderMsg && (
            <div className={orderMsg.startsWith("下单失败") ? "error" : "ok"}>{orderMsg}</div>
          )}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h3>广告</h3>
          <div className="card-actions">
            <input
              className="filter"
              placeholder="筛选币种 / 方向 / 支付…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            />
            <button className="refresh" onClick={loadAds} disabled={adsLoading}>
              {adsLoading ? "刷新中…" : "刷新"}
            </button>
          </div>
        </div>

        <div className="tabs">
          {(
            [
              { k: "all", label: "全部" },
              { k: "buy", label: "买币" },
              { k: "sell", label: "卖币" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              className={sideTab === t.k ? "tab active" : "tab"}
              onClick={() => {
                setSideTab(t.k);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {adsErr ? (
          <div className="error">加载失败：{adsErr}</div>
        ) : ads === undefined ? (
          <div className="muted">加载中…</div>
        ) : total === 0 ? (
          <div className="muted">{filter || sideTab !== "all" ? "无匹配广告" : "暂无广告"}</div>
        ) : (
          <>
            <AdsTable
              rows={pageRows as AdRow[]}
              onOrder={(ad) => {
                setSelectedAd(ad);
                setOrderAmount("");
                setOrderMsg("");
              }}
            />
            <div className="pager">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                上一页
              </button>
              <span>
                第 {safePage + 1} / {totalPages} 页（共 {total} 条）
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                下一页
              </button>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} 条/页
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>我的订单</h3>
          <div className="card-actions">
            <button className="refresh" onClick={loadOrders} disabled={ordersLoading}>
              {ordersLoading ? "刷新中…" : "刷新"}
            </button>
          </div>
        </div>
        {ordersErr ? (
          <div className="error">加载失败：{ordersErr}</div>
        ) : orders === undefined ? (
          <div className="muted">加载中…</div>
        ) : !Array.isArray(orders) || (orders as unknown[]).length === 0 ? (
          <div className="muted">暂无订单</div>
        ) : (
          <OrdersTable rows={orders as AdRow[]} onTransition={transitionOrder} />
        )}
      </section>

      <ApiTable title="交易对手" endpoint="/api/v1/otc/counterparties" empty="暂无交易对手" />
    </div>
  );
}
