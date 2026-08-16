import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { ApiTable } from "../components/ApiTable";
import { JsonTable } from "../components/JsonTable";

const ADS_EP = "/api/v1/otc/advertisements";
const PAGE_SIZES = [10, 20, 50];

// OTC 场外交易：发布广告表单 + 广告列表（筛选/分页）+ 我的订单 + 交易对手。
export function Otc() {
  // ---- 广告列表（客户端筛选 + 分页）----
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
      const r = row as Record<string, unknown> | null;
      if (sideTab !== "all" && String(r?.["side"] ?? "").toLowerCase() !== sideTab) return false;
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
            <JsonTable data={pageRows} />
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

      <ApiTable title="我的订单" endpoint="/api/v1/otc/orders" empty="暂无订单" />
      <ApiTable title="交易对手" endpoint="/api/v1/otc/counterparties" empty="暂无交易对手" />
    </div>
  );
}
