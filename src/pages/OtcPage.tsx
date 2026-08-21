// OTC 法币交易页（/otc）：商家广告列表 + 交易弹窗。
// 公开可浏览；下单/聊天需登录（弹窗内登录 CTA）。
// 进行中订单：页面顶部浮条，点击重新打开订单弹窗（状态持久化于 otc-store）。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MerchantList } from "../components/otc/MerchantList";
import { OtcTradeModal } from "../components/otc/OtcTradeModal";
import { ADS, useOtcStore, type MerchantAd } from "../store/otc-store";
import { fmtPrice } from "../lib/format";

export function OtcPage() {
  const { t } = useTranslation();
  const [session, setSession] = useState<{ ad: MerchantAd; price: number; tradeId?: string } | null>(null);
  // 进行中订单（unpaid/paid/appealing）
  const activeTrade = useOtcStore((s) => s.trades.find((x) => x.status !== "completed"));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t("otc.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("otc.subtitle")}</p>
        </div>
      </div>

      {/* 进行中订单浮条 */}
      {activeTrade && !session && (
        <button
          onClick={() =>
            setSession({
              ad: ADS.find((a) => a.id === activeTrade.adId) ?? ADS[0],
              price: activeTrade.price,
              tradeId: activeTrade.id,
            })
          }
          data-testid="active-order-bar"
          className="mb-3 flex w-full cursor-pointer items-center justify-between rounded-xl border border-accent/40 bg-tag-bg px-4 py-2.5 text-sm transition-colors hover:border-accent"
        >
          <span className="font-medium">
            {t("otc.activeOrder")} · <span className="font-mono">{activeTrade.id}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            {fmtPrice(activeTrade.total)} {activeTrade.fiat}
            <span className="text-accent">→</span>
          </span>
        </button>
      )}

      <MerchantList onTrade={(ad, price) => setSession({ ad, price })} />

      {session && (
        <OtcTradeModal
          ad={session.ad}
          price={session.price}
          initialTradeId={session.tradeId}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}
