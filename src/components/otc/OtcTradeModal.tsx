// OTC 交易弹窗：两阶段。
// ① 下单：单价（行情×溢价）+ 数量/金额联动 + 支付方式选择；
// ② 订单：15 分钟付款倒计时、收款人信息一键复制、「我已付款」Confirm 确认、
//    发起申诉、实时聊天（对方罐头话术模拟回复）；付款标记后 8s 模拟放币完成。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useToast } from "../Toast";
import { useConfirm } from "../Confirm";
import { useAuth } from "../../lib/auth";
import { useOtcStore, type MerchantAd, type PayMethod } from "../../store/otc-store";
import { fmtCountdown, qtyFromTotal, totalFromQty } from "../../lib/otc-utils";
import { fmtPrice, fmtQty } from "../../lib/format";
import { ChatDrawer } from "./ChatDrawer";
import { MethodIcon } from "./MethodIcon";
import { cn } from "../../lib/utils";

interface Props {
  ad: MerchantAd;
  price: number; // 行情价 × 溢价
  /** 从「进行中订单」浮条重开时传入，直接进入订单视图 */
  initialTradeId?: string;
  onClose: () => void;
}

const PEER_REPLIES = [
  "您好，请付款后点击「我已付款」",
  "收到转账后我会尽快确认放币",
  "请备注订单号，方便核对到账",
  "好的，正在处理中",
];

export function OtcTradeModal({ ad, price, initialTradeId, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { uid } = useAuth();
  const authed = !!uid;
  const createTradeRaw = useOtcStore((s) => s.createTrade);
  const markPaid = useOtcStore((s) => s.markPaid);
  const complete = useOtcStore((s) => s.complete);
  const appeal = useOtcStore((s) => s.appeal);
  const addMessage = useOtcStore((s) => s.addMessage);

  const [tradeId, setTradeId] = useState<string | null>(initialTradeId ?? null);
  // 从 store 派生实时订单（聊天/状态更新自动重渲染）
  const trade = useOtcStore((s) => (tradeId ? s.trades.find((x) => x.id === tradeId) ?? null : null));
  const [method, setMethod] = useState<PayMethod>(ad.methods[0]);
  const [totalStr, setTotalStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [appealing, setAppealing] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [now, setNow] = useState(Date.now());
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 订单阶段：秒级倒计时
  useEffect(() => {
    if (!trade) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [trade]);

  // 卸载清理模拟回复定时器
  useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  // 标记付款后 8s 模拟对方放币
  useEffect(() => {
    if (trade?.status !== "paid") return;
    const id = setTimeout(() => {
      complete(trade.id);
      toast.success(t("otc.completedToast"));
    }, 8000);
    return () => clearTimeout(id);
  }, [trade?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = parseFloat(totalStr) || 0;
  const qty = parseFloat(qtyStr) || 0;
  const withinLimit = total >= ad.minLimit && total <= ad.maxLimit;

  const copy = async (text: string, label?: string) => {
    await navigator.clipboard?.writeText(text);
    toast.info(`${label ?? ""}${t("otc.copied")}`.trim());
  };

  const submit = () => {
    if (!(qty > 0)) return;
    const created = createTradeRaw({
      adId: ad.id,
      merchant: ad.merchant,
      side: ad.side,
      coin: ad.coin,
      fiat: ad.fiat,
      price,
      qty,
      total,
      method,
    });
    setTradeId(created.id);
    setNow(Date.now());
  };

  const sendChat = (text: string) => {
    if (!trade) return;
    addMessage(trade.id, { from: "me", text, ts: Date.now() });
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      addMessage(trade.id, {
        from: "peer",
        text: PEER_REPLIES[Math.floor(Math.random() * PEER_REPLIES.length)],
        ts: Date.now(),
      });
    }, 1500);
  };

  const expired = trade ? now >= trade.expireAt : false;
  const msLeft = trade ? trade.expireAt - now : 0;
  const isBuy = ad.side === "buy"; // 用户视角动作

  // ---------- 订单视图 ----------
  if (trade) {
    const statusKey = `otc.status.${trade.status}`;
    return (
      <Modal title={t("otc.orderTitle")} onClose={onClose} width={760}>
        <div className="grid gap-4 p-1 lg:grid-cols-[1fr_260px]">
          {/* 左列：状态 + 收款信息 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg bg-panel-2/40 px-3 py-2">
              <div className="text-xs text-muted">
                <span className="font-mono text-foreground">{trade.id}</span>
                <span className="mx-2">·</span>
                {isBuy ? t("otc.buy") : t("otc.sell")} {fmtQty(trade.qty)} {trade.coin}
              </div>
              <Badge variant={trade.status === "completed" ? "success" : trade.status === "appealing" ? "danger" : "default"}>
                {t(statusKey)}
              </Badge>
            </div>

            {/* 15 分钟付款倒计时 */}
            {trade.status === "unpaid" && (
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

            {/* 收款人账户信息 + 一键复制 */}
            <div className="rounded-lg border border-border p-3" data-testid="payee-info">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold">{isBuy ? t("otc.payeeName") + " / " + t("otc.payeeAccount") : ""}</p>
                <button
                  onClick={() =>
                    void copy(
                      `${trade.payee.name} ${trade.payee.bank ?? ""} ${trade.payee.account}`.trim(),
                      ""
                    )
                  }
                  className="cursor-pointer text-xs font-medium text-accent hover:underline"
                  data-testid="copy-all"
                >
                  {t("otc.copyAll")}
                </button>
              </div>
              <dl className="space-y-1.5 text-xs">
                <Row label={t("otc.payeeName")} value={trade.payee.name} onCopy={() => void copy(trade.payee.name)} />
                {trade.payee.bank && <Row label={t("otc.payeeBank")} value={trade.payee.bank} onCopy={() => void copy(trade.payee.bank!)} />}
                <Row label={t("otc.payeeAccount")} value={trade.payee.account} mono onCopy={() => void copy(trade.payee.account)} />
                <Row label={t("otc.price")} value={`${fmtPrice(trade.price)} ${trade.fiat}`} mono />
                <Row label={t("otc.total")} value={`${fmtPrice(trade.total)} ${trade.fiat}`} mono />
              </dl>
            </div>

            {/* 操作区 */}
            {trade.status === "unpaid" && !expired && (
              <div className="flex flex-col gap-2">
                {!appealing ? (
                  <>
                    <Button
                      data-testid="mark-paid"
                      onClick={() =>
                        void confirm({ message: t("otc.confirmPaid"), danger: true }).then((ok) => {
                          if (!ok) return;
                          markPaid(trade.id);
                          toast.success(t("otc.paidMarked"));
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
                      onClick={() => {
                        appeal(trade.id, appealText.trim());
                        toast.warning(t("otc.appealed"));
                        setAppealing(false);
                      }}
                    >
                      {t("otc.appealSubmit")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右列：聊天 */}
          <div className="min-h-[320px] lg:h-[420px]">
            <ChatDrawer messages={trade.chat} peerName={trade.merchant} onSend={sendChat} />
          </div>
        </div>
      </Modal>
    );
  }

  // ---------- 下单视图 ----------
  return (
    <Modal title={`${isBuy ? t("otc.buy") : t("otc.sell")} ${ad.coin}`} onClose={onClose} width={460}>
      <div className="flex flex-col gap-3 p-1 text-sm">
        {/* 商家摘要 */}
        <div className="flex items-center justify-between rounded-lg bg-panel-2/40 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">
            {ad.merchant}
            {ad.verified && <span className="ml-1 text-accent">✓</span>}
          </span>
          <span className="text-muted">
            {t("otc.trades", { n: ad.trades.toLocaleString() })} · {t("otc.successRate", { r: ad.successRate })}
          </span>
        </div>

        {/* 单价 */}
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">{t("otc.price")}</span>
          <span className={`font-mono text-xl font-bold tabular-nums ${isBuy ? "text-buy" : "text-sell"}`}>
            {fmtPrice(price)} {ad.fiat}
          </span>
        </div>

        {/* 金额 ↔ 数量联动 */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("otc.total")} (${ad.fiat})`}
          <input
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => {
              setTotalStr(e.target.value);
              setQtyStr(String(qtyFromTotal(parseFloat(e.target.value) || 0, price)));
            }}
            placeholder={`${ad.minLimit} - ${ad.maxLimit.toLocaleString()}`}
            data-testid="otc-total"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("otc.qty")} (${ad.coin})`}
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
            {ad.methods.map((m) => (
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
            {`${ad.minLimit} - ${ad.maxLimit.toLocaleString()} ${ad.fiat}`}
          </p>
        )}

        {authed ? (
          <Button
            variant={isBuy ? "buy" : "sell"}
            disabled={!(qty > 0) || !withinLimit}
            onClick={submit}
            data-testid="otc-submit"
          >
            {`${isBuy ? t("otc.buy") : t("otc.sell")} ${ad.coin}`}
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
