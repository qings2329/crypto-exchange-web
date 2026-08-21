// OTC 法币交易页（/otc）：商家广告列表 + 交易弹窗。
// 公开可浏览；下单/聊天需登录（弹窗内登录 CTA）。
// 进行中订单：登录后轮询 /otc/orders，顶部浮条点击重新打开订单弹窗。
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MerchantList } from "../components/otc/MerchantList";
import { OtcTradeModal } from "../components/otc/OtcTradeModal";
import { api, type OtcAdView, type OtcOrder } from "../api/client";
import { useAuth } from "../lib/auth";
import { fmtPrice } from "../lib/format";

const ACTIVE: OtcOrder["status"][] = ["pending", "paid", "disputed"];

/** 从订单重建广告视图（浮条重开路径：直接进订单视图，不展示下单表单） */
function adFromOrder(o: OtcOrder): OtcAdView {
  return {
    id: o.ad_id,
    user_id: o.maker_id,
    side: o.side,
    asset: o.asset,
    fiat_currency: o.fiat_currency,
    price: o.price,
    min_amount: Math.min(1, o.fiat_amount),
    max_amount: Math.max(o.fiat_amount * 10, 100000),
    available: o.crypto_amount,
    payment_methods: o.payment_method,
    status: "online",
    merchant: {
      user_id: o.maker_id,
      nickname: o.counterparty_nickname ?? `商家${o.maker_id}`,
      verified: false,
      trades: 0,
      success_rate: 100,
    },
  };
}

export function OtcPage() {
  const { t } = useTranslation();
  const { uid } = useAuth();
  const [session, setSession] = useState<{ ad: OtcAdView; tradeId?: number } | null>(null);
  const [activeOrder, setActiveOrder] = useState<OtcOrder | null>(null);

  // 登录态轮询我的订单（5s）：驱动「进行中订单」浮条
  useEffect(() => {
    if (!uid) {
      setActiveOrder(null);
      return;
    }
    let alive = true;
    const load = () =>
      api
        .otcOrders()
        .then((d) => {
          if (!alive) return;
          setActiveOrder(d.find((o) => ACTIVE.includes(o.status)) ?? null);
        })
        .catch(() => {});
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [uid]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("otc.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("otc.subtitle")}</p>
        </div>
      </div>

      {/* 进行中订单浮条 */}
      {activeOrder && !session && (
        <button
          onClick={() => setSession({ ad: adFromOrder(activeOrder), tradeId: activeOrder.id })}
          data-testid="active-order-bar"
          className="mb-3 flex w-full cursor-pointer items-center justify-between rounded-xl border border-accent/40 bg-tag-bg px-4 py-2.5 text-sm transition-colors hover:border-accent"
        >
          <span className="font-medium">
            {t("otc.activeOrder")} · <span className="font-mono">#{activeOrder.id}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {fmtPrice(activeOrder.fiat_amount)} {activeOrder.fiat_currency}
            <span className="text-accent">→</span>
          </span>
        </button>
      )}

      <MerchantList onTrade={(ad) => setSession({ ad })} />

      {session && (
        <OtcTradeModal
          ad={session.ad}
          initialTradeId={session.tradeId}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}
