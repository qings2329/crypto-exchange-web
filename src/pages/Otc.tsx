import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  tokenStore,
  type OtcCounterparty,
  type OtcMessage,
  type OtcOrder,
  type OtcOrderStatus,
  type OtcProof,
  type OtcSide,
} from "../api/client";
import { useI18n } from "../i18n";
import { formatDateTime } from "../lib/timezone";
import { validateAmount } from "../lib/validate";

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
const splitMethods = (s: unknown): string[] =>
  String(s ?? "")
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);

// ---- 订单状态机（对齐后端 OrderStatus）----
const ORDER_STATUS_KEY: Record<string, string> = {
  pending: "otc.status.pending",
  paid: "otc.status.paid",
  completed: "otc.status.completed",
  cancelled: "otc.status.cancelled",
  disputed: "otc.status.disputed",
};
type OrderAct = "pay" | "cancel" | "dispute";
// 表格快捷动作；需要评分的「确认放行」放在订单详情抽屉中。
const ORDER_ACTIONS: Record<OtcOrderStatus, { act: OrderAct; key: string }[]> = {
  pending: [
    { act: "pay", key: "otc.detail.markPaid" },
    { act: "cancel", key: "otc.detail.cancel" },
  ],
  paid: [{ act: "dispute", key: "otc.detail.disputeBtn" }],
  disputed: [],
  completed: [],
  cancelled: [],
};

// 星级评分组件（onChange 缺省时为只读展示）
function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={(hover || value) >= n ? "star on" : "star"}
          disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// 广告表格：固定列 + 操作列（一键下单）
function AdsTable({ rows, onOrder }: { rows: AdRow[]; onOrder: (ad: AdRow) => void }) {
  const { t } = useI18n();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("otc.col.side")}</th>
            <th>{t("otc.col.asset")}</th>
            <th>{t("otc.col.fiat")}</th>
            <th>{t("otc.col.price")}</th>
            <th>{t("otc.col.range")}</th>
            <th>{t("otc.col.pay")}</th>
            <th>{t("otc.col.op")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ad, i) => {
            const id = adId(ad);
            const side = normStatus(ad["side"]);
            const sideLabel = side === "buy" ? t("otc.buy") : side === "sell" ? t("otc.sell") : cell(ad, "side");
            return (
              <tr key={id ?? i}>
                <td>
                  <span className={side === "buy" ? "otc-side buy" : side === "sell" ? "otc-side sell" : ""}>
                    {sideLabel}
                  </span>
                </td>
                <td>{cell(ad, "asset")}</td>
                <td>{cell(ad, "fiat_currency")}</td>
                <td>{cell(ad, "price")}</td>
                <td>
                  {cell(ad, "min_amount")} ~ {cell(ad, "max_amount")}
                </td>
                <td>{cell(ad, "payment_methods")}</td>
                <td>
                  <button className="link-btn" disabled={id === null} onClick={() => onOrder(ad)}>
                    {t("otc.order.title")}
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

// 订单表格：订单号(可点开详情) + 状态徽标 + 快捷动作
function OrdersTable({
  rows,
  onDetail,
  onAction,
}: {
  rows: AdRow[];
  onDetail: (o: AdRow) => void;
  onAction: (id: number, act: OrderAct) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("otc.col.orderId")}</th>
            <th>{t("otc.col.side")}</th>
            <th>{t("otc.col.asset")}</th>
            <th>{t("otc.col.amount")}</th>
            <th>{t("otc.col.status")}</th>
            <th>{t("otc.col.op")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o, i) => {
            const id = orderId(o);
            const st = normStatus(o["status"]) as OtcOrderStatus;
            const label = t(ORDER_STATUS_KEY[st] ?? "otc.order.unknown");
            const cls = ORDER_STATUS_KEY[st] ? st : "unknown";
            const side = normStatus(o["side"]);
            const sideLabel = side === "buy" ? t("otc.buy") : side === "sell" ? t("otc.sell") : cell(o, "side");
            const acts = ORDER_ACTIONS[st] ?? [];
            return (
              <tr key={id ?? i}>
                <td>
                  <button className="link-btn" disabled={id === null} onClick={() => id !== null && onDetail(o)}>
                    {id ?? "--"}
                  </button>
                </td>
                <td>{sideLabel}</td>
                <td>{cell(o, "asset")}</td>
                <td>{cell(o, "crypto_amount")}</td>
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
                          key={a.act}
                          className="link-btn"
                          disabled={id === null}
                          onClick={() => id !== null && onAction(id, a.act)}
                        >
                          {t(a.key)}
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

// 订单详情抽屉：完整信息 + 进度 + 沟通记录/付款凭证（真实后端接口）+ 状态流转/评分/申诉
function OrderDetail({
  order,
  onClose,
  onChanged,
}: {
  order: OtcOrder;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const me = Number(tokenStore.uid);
  const st = normStatus(order.status) as OtcOrderStatus;
  const side = normStatus(order.side);
  const isSellAd = side === "sell";
  const sellerId = isSellAd ? order.maker_id : order.taker_id;
  const buyerId = isSellAd ? order.taker_id : order.maker_id;
  const counterpartyId = me === sellerId ? buyerId : sellerId;
  const myRole =
    me === sellerId ? t("otc.detail.myRoleSeller") : me === buyerId ? t("otc.detail.myRoleBuyer") : t("otc.detail.myRoleObserver");

  const [acting, setActing] = useState(false);
  const [err, setErr] = useState("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(order.rating || 0);
  const [disputeOpen, setDisputeOpen] = useState(false);

  // 聊天与付款凭证走真实后端接口（订单参与方可见）。
  const [messages, setMessages] = useState<OtcMessage[]>([]);
  const [proofs, setProofs] = useState<OtcProof[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (order.rating > 0) setRating(order.rating);
  }, [order]);

  const run = async (fn: () => Promise<unknown>) => {
    setActing(true);
    setErr("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const timeline = [
    { k: "otc.detail.tl.create", v: order.created_at },
    { k: "otc.detail.tl.paid", v: order.paid_at },
    { k: "otc.detail.tl.completed", v: order.completed_at },
  ];

  // 加载沟通记录与付款凭证
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [ms, ps] = await Promise.all([
          api.otcMessages(order.id),
          api.otcProofs(order.id),
        ]);
        if (!alive) return;
        setMessages(ms);
        setProofs(ps);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [order.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      const m = await api.otcSendMessage(order.id, text);
      setMessages((p) => [...p, m]);
      setDraft("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onProof = async (file: File) => {
    try {
      const p = await api.otcUploadProof(order.id, file);
      setProofs((prev) => [...prev, p]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="otc-drawer-mask" onClick={onClose}>
      <div className="otc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="order-head">
          <strong>{t("otc.detail.orderTitle", { id: order.id })}</strong>
          <span className={`ostatus ${st}`}>{t(ORDER_STATUS_KEY[st] ?? "otc.order.unknown")}</span>
          <button className="link-btn" onClick={onClose}>
            {t("otc.order.close")}
          </button>
        </div>

        <div className="kv">
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.side")}</span>
            <span className="kv-v">{isSellAd ? t("otc.sell") : t("otc.buy")}</span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.myRole")}</span>
            <span className="kv-v">{myRole}</span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.counterparty")}</span>
            <span className="kv-v">{t("otc.detail.uid", { id: counterpartyId || "--" })}</span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.asset")}</span>
            <span className="kv-v">{order.asset}</span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.price")}</span>
            <span className="kv-v">
              {order.price} {order.fiat_currency}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.amount")}</span>
            <span className="kv-v">
              {order.crypto_amount} {order.asset}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.fiatTotal")}</span>
            <span className="kv-v">
              {order.fiat_amount} {order.fiat_currency}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-k">{t("otc.detail.kv.payMethod")}</span>
            <span className="kv-v">{order.payment_method || "--"}</span>
          </div>
          {order.rating > 0 && (
            <div className="kv-row">
              <span className="kv-k">{t("otc.detail.kv.rating")}</span>
              <span className="kv-v">
                <StarRating value={order.rating} />
              </span>
            </div>
          )}
        </div>

        <div className="otc-sub">{t("otc.detail.timeline")}</div>
        <div className="otc-timeline">
          {timeline.map((tl) => (
            <div key={tl.k} className="tl-item">
              <span className="tl-k">{t(tl.k)}</span>
              <span className="tl-v">{tl.v ? formatDateTime(tl.v) : "—"}</span>
            </div>
          ))}
        </div>

        {st === "pending" && <div className="otc-hint">{t("otc.detail.hintPay")}</div>}
        {st === "disputed" && <div className="otc-hint sell">{t("otc.detail.hintDispute")}</div>}

        {/* 状态流转操作区 */}
        {st === "pending" && (
          <div className="otc-actions">
            <button className="submit" disabled={acting} onClick={() => run(() => api.otcMarkPaid(order.id))}>
              {t("otc.detail.markPaid")}
            </button>
            <button className="link-btn" disabled={acting} onClick={() => run(() => api.otcCancelOrder(order.id))}>
              {t("otc.detail.cancel")}
            </button>
          </div>
        )}
        {st === "paid" && (
          <div className="otc-actions">
            <div className="otc-rate">
              <span>{t("otc.detail.ratePrompt")}</span>
              <StarRating value={rating} onChange={setRating} />
            </div>
            <button
              className="submit"
              disabled={acting || rating === 0}
              onClick={() => run(() => api.otcCompleteOrder(order.id, rating))}
            >
              {t("otc.detail.complete")}
            </button>
            <button className="link-btn" disabled={acting} onClick={() => setDisputeOpen((v) => !v)}>
              {t("otc.detail.disputeBtn")}
            </button>
          </div>
        )}

        {disputeOpen && st !== "completed" && st !== "cancelled" && (
          <div className="otc-dispute">
            <label>
              {t("otc.detail.disputeReason")}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("otc.detail.disputePlaceholder")}
              />
            </label>
            <button
              className="submit"
              disabled={acting || !reason.trim()}
              onClick={() =>
                run(async () => {
                  await api.otcOpenDispute(order.id, reason.trim());
                  setDisputeOpen(false);
                })
              }
            >
              {t("otc.detail.disputeSubmit")}
            </button>
          </div>
        )}

        {err && <div className="error">{err}</div>}

        {/* 沟通记录（真实后端接口，仅订单参与方可见） */}
        <div className="otc-sub">
          {t("otc.detail.chatTitle")} <span className="muted">{t("otc.detail.chatOnly")}</span>
        </div>
        <div className="otc-chat">
          {loading && messages.length === 0 && <div className="muted">{t("common.loading")}</div>}
          {!loading && messages.length === 0 && <div className="muted">{t("otc.detail.chatEmpty")}</div>}
          {messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <div key={m.id} className={mine ? "chat-line me" : "chat-line"}>
                <div className="chat-meta">
                  {mine ? t("otc.detail.me") : t("otc.detail.uid", { id: m.sender_id })}
                  {m.created_at ? ` · ${new Date(m.created_at).toLocaleString()}` : ""}
                </div>
                <div className="chat-content">{m.content}</div>
              </div>
            );
          })}
        </div>
        <div className="otc-chat-input">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("otc.detail.chatPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button className="link-btn" disabled={!draft.trim()} onClick={send}>
            {t("otc.detail.chatSend")}
          </button>
        </div>

        {/* 付款凭证（真实后端接口，买方上传，仅订单参与方可见） */}
        <div className="otc-sub">
          {t("otc.detail.proofTitle")} <span className="muted">{t("otc.detail.proofOnly")}</span>
        </div>
        <div className="otc-proof">
          <label className="proof-upload">
            {t("otc.detail.proofUpload")}
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onProof(f);
                e.target.value = "";
              }}
            />
          </label>
          {loading && proofs.length === 0 && <span className="muted">{t("common.loading")}</span>}
          {!loading && proofs.length === 0 && <span className="muted">{t("otc.detail.proofEmpty")}</span>}
          {proofs.map((p) => (
            <div key={p.id} className="proof-item">
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.file_name}
              </a>
              {p.created_at ? <span className="muted"> · {new Date(p.created_at).toLocaleString()}</span> : null}
              {p.size ? <span className="muted"> · {(p.size / 1024).toFixed(1)} KB</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 交易对手与信誉卡片（基于 counterparties 的 rating_sum/rating_count/trades_* 聚合）
function CounterpartiesCard() {
  const { t } = useI18n();
  const [list, setList] = useState<OtcCounterparty[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.otcCounterparties();
      setList(d);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = list ?? [];
  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("otc.counterparties")}</h3>
        <div className="card-actions">
          <button className="refresh" onClick={load}>
            {t("common.refresh")}
          </button>
        </div>
      </div>
      {err ? (
        <div className="error">{t("common.loadError", { err })}</div>
      ) : list === undefined ? (
        <div className="muted">{t("common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="muted">{t("otc.emptyCounterparties")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("otc.col.cp")}</th>
                <th>{t("otc.col.deals")}</th>
                <th>{t("otc.col.done")}</th>
                <th>{t("otc.col.rate")}</th>
                <th>{t("otc.col.avgRating")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const rate = c.rating_count > 0 ? c.rating_sum / c.rating_count : 0;
                const completion = c.trades_total > 0 ? Math.round((c.trades_completed / c.trades_total) * 100) : 0;
                return (
                  <tr key={c.counterparty_id ?? i}>
                    <td>{t("otc.detail.uid", { id: c.counterparty_id ?? "--" })}</td>
                    <td>{c.trades_total}</td>
                    <td>{c.trades_completed}</td>
                    <td>{completion}%</td>
                    <td>
                      {c.rating_count > 0 ? (
                        <StarRating value={Math.round(rate)} />
                      ) : (
                        <span className="muted">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// OTC 场外交易：发布广告 + 广告列表（筛选/分页/分Tab）+ 吃单 + 订单状态机 +
// 订单详情/沟通/凭证 + 申诉 + 评分与对手方信誉。
export function Otc() {
  const { t } = useI18n();
  // ---- 广告列表（客户端筛选 + 分页 + 分Tab）----
  const [ads, setAds] = useState<AdRow[] | undefined>(undefined);
  const [adsErr, setAdsErr] = useState("");
  const [adsLoading, setAdsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [sideTab, setSideTab] = useState<"all" | "buy" | "sell">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const loadAds = useCallback(async () => {
    setAdsLoading(true);
    try {
      const d = await api.otcAds();
      setAds(d as unknown as AdRow[]);
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
    return (ads as AdRow[]).filter((row) => {
      const r = row;
      if (sideTab !== "all" && normStatus(r["side"]) !== sideTab) return false;
      if (kw && !JSON.stringify(row).toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [ads, filter, sideTab]);

  const total = Array.isArray(filtered) ? filtered.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = Array.isArray(filtered)
    ? (filtered as AdRow[]).slice(safePage * pageSize, safePage * pageSize + pageSize)
    : filtered;

  // ---- 发布广告表单 ----
  const [showForm, setShowForm] = useState(false);
  const [side, setSide] = useState<OtcSide>("sell");
  const [asset, setAsset] = useState("");
  const [fiat, setFiat] = useState("");
  const [price, setPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [payMethods, setPayMethods] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [formErr, setFormErr] = useState(false);

  const submitAd = async () => {
    setFormMsg("");
    setFormErr(false);
    const pRes = validateAmount(price);
    const minRes = validateAmount(minAmount);
    const maxRes = validateAmount(maxAmount);
    if (!asset.trim() || !fiat.trim()) {
      setFormMsg(t("otc.form.errAsset"));
      setFormErr(true);
      return;
    }
    if (!pRes.ok) {
      setFormMsg(t("otc.form.errPrice"));
      setFormErr(true);
      return;
    }
    if (!minRes.ok || !maxRes.ok || (maxRes.value as number) < (minRes.value as number)) {
      setFormMsg(t("otc.form.errAmount"));
      setFormErr(true);
      return;
    }
    const methods = payMethods
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
    if (!methods) {
      setFormMsg(t("otc.form.errPay"));
      setFormErr(true);
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.otcCreateAd({
        side,
        asset: asset.trim(),
        fiat_currency: fiat.trim(),
        price: pRes.value as number,
        min_amount: minRes.value as number,
        max_amount: maxRes.value as number,
        payment_methods: methods,
      });
      setFormMsg(t("otc.form.published", { id: r.id }));
      setFormErr(false);
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
      setFormMsg(t("otc.form.publishFail", { err: (e as Error).message }));
      setFormErr(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 吃单（下单）----
  const [selectedAd, setSelectedAd] = useState<AdRow | null>(null);
  const [fiatAmount, setFiatAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [orderErr, setOrderErr] = useState(false);
  const [ordersReload, setOrdersReload] = useState(0);

  const submitOrder = async () => {
    if (!selectedAd) return;
    const id = adId(selectedAd);
    if (id === null) {
      setOrderMsg(t("otc.order.noAdId"));
      setOrderErr(true);
      return;
    }
    const faRes = validateAmount(fiatAmount);
    if (!faRes.ok) {
      setOrderMsg(t("otc.order.errFiat"));
      setOrderErr(true);
      return;
    }
    if (!payMethod.trim()) {
      setOrderMsg(t("otc.order.errPay"));
      setOrderErr(true);
      return;
    }
    setOrderSubmitting(true);
    try {
      await api.otcTakeOrder({ ad_id: id, fiat_amount: faRes.value as number, payment_method: payMethod.trim() });
      setOrderMsg(t("otc.order.placed"));
      setOrderErr(false);
      setSelectedAd(null);
      setFiatAmount("");
      setPayMethod("");
      setOrdersReload((k) => k + 1);
    } catch (e) {
      setOrderMsg(t("otc.order.fail", { err: (e as Error).message }));
      setOrderErr(true);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const adMethods = selectedAd ? splitMethods(selectedAd["payment_methods"]) : [];
  const adPrice = selectedAd ? Number(selectedAd["price"]) : NaN;
  const estCrypto =
    Number.isFinite(adPrice) && parseFloat(fiatAmount) > 0 ? parseFloat(fiatAmount) / adPrice : NaN;

  // ---- 我的订单 ----
  const [orders, setOrders] = useState<OtcOrder[] | undefined>(undefined);
  const [ordersErr, setOrdersErr] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OtcOrder | null>(null);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const d = await api.otcOrders();
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

  // 详情抽屉打开时，随订单列表刷新同步为最新状态
  useEffect(() => {
    if (detailOrder && Array.isArray(orders)) {
      const fresh = orders.find((o) => o.id === detailOrder.id);
      if (fresh) setDetailOrder(fresh);
    }
    // 仅依赖 orders：详情数据随列表刷新而同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const actionOrder = async (id: number, act: OrderAct) => {
    try {
      if (act === "pay") await api.otcMarkPaid(id);
      else if (act === "cancel") await api.otcCancelOrder(id);
      else if (act === "dispute") await api.otcOpenDispute(id);
      loadOrders();
    } catch (e) {
      setOrdersErr((e as Error).message);
    }
  };

  const openDetail = (o: AdRow) => setDetailOrder(o as unknown as OtcOrder);

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("page.otc")}</h2>
        <button className="refresh" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("otc.collapse") : t("otc.publishAd")}
        </button>
      </div>

      {showForm && (
        <div className="orderform wform">
          <label>
            {t("otc.form.side")}
            <select value={side} onChange={(e) => setSide(e.target.value as OtcSide)}>
              <option value="sell">{t("otc.form.sideSell")}</option>
              <option value="buy">{t("otc.form.sideBuy")}</option>
            </select>
          </label>
          <label>
            {t("otc.form.asset")}
            <input value={asset} onChange={(e) => setAsset(e.target.value)} placeholder={t("otc.form.ph.asset")} />
          </label>
          <label>
            {t("otc.form.fiat")}
            <input value={fiat} onChange={(e) => setFiat(e.target.value)} placeholder={t("otc.form.ph.fiat")} />
          </label>
          <label>
            {t("otc.form.price")}
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            {t("otc.form.minAmount")}
            <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            {t("otc.form.maxAmount")}
            <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </label>
          <label>
            {t("otc.form.payMethods")}
            <input
              value={payMethods}
              onChange={(e) => setPayMethods(e.target.value)}
              placeholder={t("otc.form.ph.pay")}
            />
          </label>
          <label>
            {t("otc.form.remark")}
            <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={t("otc.form.ph.remark")} />
          </label>
          <button className="submit" onClick={submitAd} disabled={submitting}>
            {submitting ? t("otc.submitting") : t("otc.form.submit")}
          </button>
          {formMsg && <div className={formErr ? "error" : "ok"}>{formMsg}</div>}
        </div>
      )}

      {selectedAd && (
        <div className="orderform wform">
          <div className="order-head">
            <strong>{t("otc.order.title")}</strong>
            <button className="link-btn" onClick={() => setSelectedAd(null)}>
              {t("otc.order.close")}
            </button>
          </div>
          <div className="order-meta">
            {normStatus(selectedAd["side"]) === "buy" ? t("otc.buy") : t("otc.sell")} · {cell(selectedAd, "asset")} ·{" "}
            {t("otc.detail.kv.price")} {cell(selectedAd, "price")} {cell(selectedAd, "fiat_currency")}
          </div>
          <label>
            {t("otc.order.fiatAmount", { fiat: cell(selectedAd, "fiat_currency") })}
            <input
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>
          <div className="order-total">
            {t("otc.order.total", {
              amount: Number.isFinite(estCrypto) ? estCrypto.toLocaleString() : "--",
              asset: cell(selectedAd, "asset"),
            })}
          </div>
          <label>
            {t("otc.order.payMethod")}
            {adMethods.length <= 1 ? (
              <input value={adMethods[0] ?? ""} disabled />
            ) : (
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="">{t("otc.selectPlaceholder")}</option>
                {adMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button className="submit" onClick={submitOrder} disabled={orderSubmitting}>
            {orderSubmitting ? t("otc.submitting") : t("otc.order.submit")}
          </button>
          {orderMsg && (
            <div className={orderErr ? "error" : "ok"}>{orderMsg}</div>
          )}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h3>{t("otc.ads")}</h3>
          <div className="card-actions">
            <input
              className="filter"
              placeholder={t("otc.filterPlaceholder")}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            />
            <button className="refresh" onClick={loadAds} disabled={adsLoading}>
              {adsLoading ? t("common.loading") : t("common.refresh")}
            </button>
          </div>
        </div>

        <div className="tabs">
          {(
            [
              { k: "all", label: t("otc.tab.all") },
              { k: "buy", label: t("otc.tab.buy") },
              { k: "sell", label: t("otc.tab.sell") },
            ] as const
          ).map((tab) => (
            <button
              key={tab.k}
              className={sideTab === tab.k ? "tab active" : "tab"}
              onClick={() => {
                setSideTab(tab.k);
                setPage(0);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {adsErr ? (
          <div className="error">{t("common.loadError", { err: adsErr })}</div>
        ) : ads === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : total === 0 ? (
          <div className="muted">{filter || sideTab !== "all" ? t("otc.emptyAdsFilter") : t("otc.emptyAds")}</div>
        ) : (
          <>
            <AdsTable
              rows={pageRows as AdRow[]}
              onOrder={(ad) => {
                setSelectedAd(ad);
                setFiatAmount("");
                setPayMethod("");
                setOrderMsg("");
              }}
            />
            <div className="pager">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                {t("common.prev")}
              </button>
              <span>
                {t("common.pageInfo", { page: safePage + 1, total: totalPages, count: total })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                {t("common.next")}
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
                    {t("otc.perPage", { n: s })}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("otc.orders")}</h3>
          <div className="card-actions">
            <button className="refresh" onClick={loadOrders} disabled={ordersLoading}>
              {ordersLoading ? t("common.loading") : t("common.refresh")}
            </button>
          </div>
        </div>
        {ordersErr ? (
          <div className="error">{t("common.loadError", { err: ordersErr })}</div>
        ) : orders === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : !Array.isArray(orders) || orders.length === 0 ? (
          <div className="muted">{t("otc.emptyOrders")}</div>
        ) : (
          <OrdersTable
            rows={orders as unknown as AdRow[]}
            onDetail={openDetail}
            onAction={actionOrder}
          />
        )}
      </section>

      <CounterpartiesCard />

      {detailOrder && (
        <OrderDetail order={detailOrder} onClose={() => setDetailOrder(null)} onChanged={loadOrders} />
      )}
    </div>
  );
}
