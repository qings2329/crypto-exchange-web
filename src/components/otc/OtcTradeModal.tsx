// OTC 交易弹窗：两阶段（对接 /api/v1/otc 真实接口）。
// ① 下单：单价（服务端实时计价）+ 数量/金额联动 + 支付方式选择 → POST /orders/take；
// ② 订单：服务端 expire_at 驱动 15 分钟付款倒计时、收款人信息一键复制、
//    「我已付款」Confirm 确认（POST /orders/{id}/pay）、申诉（/dispute）、
//    聊天轮询（/messages）；订单状态 2s 轮询（卖方放币由后端模拟自动完成）。
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useToast } from "../Toast";
import { useConfirm } from "../Confirm";
import { useAuth } from "../../lib/auth";
import { api, ApiError, type OtcAdView, type OtcMessage, type OtcOrder, type OtcOrderStatus } from "../../api/client";
import type { PayMethod } from "./MethodIcon";
import { fmtCountdown, msLeftFrom, qtyFromTotal, totalFromQty } from "../../lib/otc-utils";
import { fmtPrice, fmtQty } from "../../lib/format";
import { ChatDrawer } from "./ChatDrawer";
import { MethodIcon } from "./MethodIcon";
import { cn } from "../../lib/utils";

interface Props {
  ad: OtcAdView;
  /** 从「进行中订单」浮条重开时传入，直接进入订单视图 */
  initialTradeId?: number;
  onClose: () => void;
}

const TERMINAL: OtcOrderStatus[] = ["completed", "cancelled"];

export function OtcTradeModal({ ad, initialTradeId, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { uid } = useAuth();
  const authed = !!uid;

  const price = ad.price; // 服务端按实时行情 × 汇率 × 溢价计算
  const [order, setOrder] = useState<OtcOrder | null>(null);
  const [method, setMethod] = useState<PayMethod>((ad.payment_methods.split(",")[0] as PayMethod) ?? "bank");
  const [totalStr, setTotalStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appealing, setAppealing] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [messages, setMessages] = useState<OtcMessage[]>([]);
  const [now, setNow] = useState(Date.now());
  const prevStatus = useRef<string | null>(null);

  // 重开已有订单：拉取我的订单列表定位该单
  useEffect(() => {
    if (initialTradeId == null) return;
    let alive = true;
    api
      .otcOrders()
      .then((d) => {
        if (!alive) return;
        const o = d.find((x) => x.id === initialTradeId);
        if (o) setOrder(o);
        else toast.warning(t("otc.orderNotFound"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initialTradeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 订单状态轮询：2s（终态停止）
  useEffect(() => {
    if (!order || TERMINAL.includes(order.status)) return;
    const id = setInterval(() => {
      api
        .otcOrders()
        .then((d) => {
          const fresh = d.find((x) => x.id === order.id);
          if (fresh) setOrder(fresh);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [order]);

  // 状态迁移提示：paid → completed 时放币完成
  useEffect(() => {
    if (!order) return;
    if (prevStatus.current === "paid" && order.status === "completed") toast.success(t("otc.completedToast"));
    prevStatus.current = order.status;
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 秒级倒计时
  useEffect(() => {
    if (!order) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [order]);

  // 聊天：订单打开即拉取 + 3s 轮询
  const refreshMessages = useCallback((orderId: number) => {
    api
      .otcMessages(orderId)
      .then(setMessages)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!order) return;
    refreshMessages(order.id);
    const id = setInterval(() => refreshMessages(order.id), 3000);
    return () => clearInterval(id);
  }, [order?.id, refreshMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = parseFloat(totalStr) || 0;
  const withinLimit = total >= ad.min_amount && total <= ad.max_amount;

  const copy = async (text: string, label?: string) => {
    await navigator.clipboard?.writeText(text);
    toast.info(`${label ?? ""}${t("otc.copied")}`.trim());
  };

  const submit = async () => {
    if (!(total > 0) || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.otcTakeOrder({ ad_id: ad.id, fiat_amount: total, payment_method: method });
      setNow(Date.now());
      prevStatus.current = created.status;
      setOrder(created);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("otc.loadFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const sendChat = async (text: string) => {
    if (!order) return;
    try {
      await api.otcSendMessage(order.id, text);
      refreshMessages(order.id);
      // 对方罐头回复约 1.5s 后落库，稍后再刷一次
      setTimeout(() => refreshMessages(order.id), 2000);
    } catch {
      /* 轮询会兜底 */
    }
  };

  const markPaid = async () => {
    if (!order) return;
    try {
      await api.otcMarkPaid(order.id);
      toast.success(t("otc.paidMarked"));
      const d = await api.otcOrders();
      const fresh = d.find((x) => x.id === order.id);
      if (fresh) setOrder(fresh);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("otc.loadFailed"));
    }
  };

  const dispute = async () => {
    if (!order) return;
    try {
      await api.otcOpenDispute(order.id, appealText.trim());
      toast.warning(t("otc.appealed"));
      setAppealing(false);
      const d = await api.otcOrders();
      const fresh = d.find((x) => x.id === order.id);
      if (fresh) setOrder(fresh);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("otc.loadFailed"));
    }
  };

  const isBuy = ad.side === "buy"; // 用户视角动作

  // ---------- 订单视图 ----------
  if (order) {
    const msLeft = msLeftFrom(order.expire_at, now);
    const expired = order.status === "pending" && msLeft <= 0;
    const statusKey = `otc.status.${order.status}`;
    return (
      <Modal title={t("otc.orderTitle")} onClose={onClose} width={760}>
        <div className="grid gap-4 p-1 lg:grid-cols-[1fr_260px]">
          {/* 左列：状态 + 收款信息 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg bg-panel-2/40 px-3 py-2">
              <div className="text-xs text-muted">
                <span className="font-mono text-foreground">#{order.id}</span>
                <span className="mx-2">·</span>
                {isBuy ? t("otc.buy") : t("otc.sell")} {fmtQty(order.crypto_amount)} {order.asset}
              </div>
              <Badge variant={order.status === "completed" ? "success" : order.status === "disputed" || order.status === "cancelled" ? "danger" : "default"}>
                {t(statusKey)}
              </Badge>
            </div>

            {/* 15 分钟付款倒计时（服务端 expire_at 驱动） */}
            {order.status === "pending" && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2.5",
                  expired ? "border-sell/40 bg-sell/10" : "border-accent/30 bg-tag-bg"
                )}
                data-testid="otc-countdown"
              >
                <span className="text-xs text-muted">{expired ? t("otc.expired") : t("otc.payWithin", { m: 15 })}</span>
                <span
                  className={cn(
                    "font-mono text-xl font-bold tabular-nums",
                    expired || msLeft < 5 * 60 * 1000 ? "text-sell" : "text-accent"
                  )}
                  data-testid="countdown-value"
                >
                  {fmtCountdown(msLeft)}
                </span>
              </div>
            )}

            {/* 收款人账户信息 + 一键复制（买方订单由服务端返回掩码账号） */}
            {isBuy && order.payee != null && (() => {
              const payee = order.payee!;
              return (
              <div className="rounded-lg border border-border p-3" data-testid="payee-info">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold">{t("otc.payeeName") + " / " + t("otc.payeeAccount")}</p>
                  <button
                    onClick={() => {
                      const p = order.payee;
                      if (p) void copy(`${p.name} ${p.bank ?? ""} ${p.account}`.trim(), "");
                    }}
                    className="cursor-pointer text-xs font-medium text-accent hover:underline"
                    data-testid="copy-all"
                  >
                    {t("otc.copyAll")}
                  </button>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <Row label={t("otc.payeeName")} value={payee.name} onCopy={() => void copy(payee.name)} />
                  {payee.bank && (() => {
                    const bank = payee.bank;
                    return <Row label={t("otc.payeeBank")} value={bank} onCopy={() => void copy(bank)} />;
                  })()}
                  <Row label={t("otc.payeeAccount")} value={payee.account} mono onCopy={() => void copy(payee.account)} />
                  <Row label={t("otc.price")} value={`${fmtPrice(order.price)} ${order.fiat_currency}`} mono />
                  <Row label={t("otc.total")} value={`${fmtPrice(order.fiat_amount)} ${order.fiat_currency}`} mono />
                </dl>
              </div>
              );
            })()}
            {!isBuy && (
              <p className="rounded-lg border border-border p-3 text-xs leading-relaxed text-muted" data-testid="sell-hint">
                {t("otc.sellHint")}
              </p>
            )}

            {/* 操作区 */}
            {order.status === "pending" && !expired && (
              <div className="flex flex-col gap-2">
                {!appealing ? (
                  <>
                    <Button
                      data-testid="mark-paid"
                      onClick={() =>
                        void confirm({ message: t("otc.confirmPaid"), danger: true }).then((ok) => {
                          if (ok) void markPaid();
                        })
                      }
                    >
                      {t("otc.markPaid")}
                    </Button>
                    <button
                      onClick={() => setAppealing(true)}
                      className="cursor-pointer text-center text-xs text-muted transition-colors hover:text-sell"
                    >
                      {t("otc.appeal")}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <textarea
                      value={appealText}
                      onChange={(e) => setAppealText(e.target.value)}
                      placeholder={t("otc.appealReason")}
                      rows={3}
                      data-testid="appeal-input"
                      className="w-full resize-none rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-accent"
                    />
                    <Button
                      variant="sell"
                      size="sm"
                      disabled={!appealText.trim()}
                      data-testid="appeal-submit"
                      onClick={() => void dispute()}
                    >
                      {t("otc.appealSubmit")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 已付款待放币 / 终态提示 */}
            {order.status === "paid" && (
              <p className="rounded-lg bg-tag-bg px-3 py-2 text-xs text-muted">{t("otc.waitingRelease")}</p>
            )}
            {(expired || order.status === "cancelled") && (
              <p className="rounded-lg bg-sell/10 px-3 py-2 text-xs text-sell">
                {order.cancel_reason === "timeout" || expired ? t("otc.expired") : t("otc.status.cancelled")}
              </p>
            )}
          </div>

          {/* 右列：聊天 */}
          <div className="min-h-[320px] lg:h-[420px]">
            <ChatDrawer messages={messages} peerName={ad.merchant.nickname} myUid={uid == null ? null : Number(uid)} onSend={(x) => void sendChat(x)} />
          </div>
        </div>
      </Modal>
    );
  }

  // ---------- 下单视图 ----------
  return (
    <Modal title={`${isBuy ? t("otc.buy") : t("otc.sell")} ${ad.asset}`} onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 p-1 text-sm">
        {/* 商家摘要 */}
        <div className="flex items-center justify-between rounded-lg bg-panel-2/40 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">
            {ad.merchant.nickname}
            {ad.merchant.verified && <span className="ml-1 text-accent">✓</span>}
          </span>
          <span className="text-muted">
            {t("otc.trades", { n: ad.merchant.trades.toLocaleString() })} · {t("otc.successRate", { r: ad.merchant.success_rate })}
          </span>
        </div>

        {/* 单价 */}
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">{t("otc.price")}</span>
          <span className={`font-mono text-xl font-bold tabular-nums ${isBuy ? "text-buy" : "text-sell"}`}>
            {fmtPrice(price)} {ad.fiat_currency}
          </span>
        </div>

        {/* 金额 ↔ 数量联动 */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("otc.total")} (${ad.fiat_currency})`}
          <input
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => {
              setTotalStr(e.target.value);
              setQtyStr(String(qtyFromTotal(parseFloat(e.target.value) || 0, price)));
            }}
            placeholder={`${ad.min_amount} - ${ad.max_amount.toLocaleString()}`}
            data-testid="otc-total"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("otc.qty")} (${ad.asset})`}
          <input
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => {
              setQtyStr(e.target.value);
              setTotalStr(String(totalFromQty(parseFloat(e.target.value) || 0, price)));
            }}
            data-testid="otc-qty"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
          />
        </label>

        {/* 支付方式 */}
        <div className="flex flex-col gap-1 text-xs text-muted">
          {t("otc.payMethod")}
          <div className="flex gap-1.5">
            {(ad.payment_methods.split(",").filter(Boolean) as PayMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 transition-colors",
                  method === m ? "border-accent bg-tag-bg text-accent" : "border-border text-muted hover:border-accent/50"
                )}
              >
                <MethodIcon method={m} />
                {t(`otc.method.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {total > 0 && !withinLimit && (
          <p className="text-xs text-sell" role="alert">
            {`${ad.min_amount} - ${ad.max_amount.toLocaleString()} ${ad.fiat_currency}`}
          </p>
        )}

        {authed ? (
          <Button
            variant={isBuy ? "buy" : "sell"}
            disabled={!(total > 0) || !withinLimit || submitting}
            onClick={() => void submit()}
            data-testid="otc-submit"
          >
            {`${isBuy ? t("otc.buy") : t("otc.sell")} ${ad.asset}`}
          </Button>
        ) : (
          <a
            href="#/login"
            className="grid h-9 place-items-center rounded-lg bg-accent text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            {t("otc.loginToTrade")}
          </a>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={cn("flex min-w-0 items-center gap-1.5", mono && "font-mono tabular-nums")}>
        <span className="truncate text-foreground">{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="shrink-0 cursor-pointer text-accent hover:underline" title={t("otc.copy")}>
            ⧉
          </button>
        )}
      </dd>
    </div>
  );
}
