// 商家广告列表：快捷区（金额直达最优价）/ 自选区（完整筛选）双 Tab。
// 单价 = 实时行情 × 广告溢价；买入升序、卖出降序排列。
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ADS, type MerchantAd, type OtcCoin, type OtcFiat, type OtcSide, type PayMethod } from "../../store/otc-store";
import { filterAds, sortAds } from "../../lib/otc-utils";
import { useTickerLive } from "../../hooks/use-ticker-live";
import { fmtPrice, fmtQty } from "../../lib/format";
import { cn } from "../../lib/utils";
import { MethodIcon } from "./MethodIcon";

interface Props {
  onTrade: (ad: MerchantAd, price: number) => void;
}

const COINS: OtcCoin[] = ["USDT", "BTC"];
const FIATS: OtcFiat[] = ["CNY", "USD"];
const METHODS: (PayMethod | "all")[] = ["all", "wechat", "alipay", "bank"];

export function MerchantList({ onTrade }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"express" | "p2p">("express");
  const [side, setSide] = useState<OtcSide>("buy");
  const [coin, setCoin] = useState<OtcCoin>("USDT");
  const [fiat, setFiat] = useState<OtcFiat>("CNY");
  const [method, setMethod] = useState<PayMethod | "all">("all");
  const [amountStr, setAmountStr] = useState("");

  const { ticker: btcTicker } = useTickerLive("BTCUSDT");

  const amount = parseFloat(amountStr) || null;

  // 法币汇率（演示固定）：USD/CNY
  const FIAT_RATE: Record<OtcFiat, number> = { CNY: 7.23, USD: 1 };

  // 单价表：基准价 × 法币汇率 × 广告溢价
  const priced = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ADS) {
      if (a.coin !== coin || a.fiat !== fiat) continue;
      const b = a.coin === "BTC" ? btcTicker?.lastPrice ?? 0 : 1;
      m.set(a.id, Math.round(b * FIAT_RATE[a.fiat] * (1 + a.premium / 100) * 100) / 100);
    }
    return m;
  }, [coin, fiat, btcTicker?.lastPrice]);

  const ads = useMemo(
    () => sortAds(filterAds(ADS, { side, coin, fiat, method, amount }), priced),
    [side, coin, fiat, method, amount, priced]
  );
  const best = ads[0];

  return (
    <div className="flex flex-col gap-3">
      {/* Tab：快捷区 / 自选区 */}
      <div className="flex gap-5 border-b border-border px-1">
        {(
          [
            ["express", t("otc.tabExpress")],
            ["p2p", t("otc.tabP2P")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`otc-tab-${key}`}
            className={cn(
              "relative cursor-pointer pb-2.5 text-[13px] transition-colors",
              tab === key ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            )}
          >
            {label}
            {tab === key && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* 快捷区：方向 + 币种 + 法币 + 金额 → 最优报价卡 */}
      {tab === "express" && (
        <div className="rounded-xl border border-border bg-card p-4" data-testid="express-panel">
          <div className="flex flex-wrap items-end gap-3">
            {/* 买/卖切换 */}
            <div className="flex overflow-hidden rounded-lg border border-border" role="group">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  data-testid={`express-${s}`}
                  className={cn(
                    "cursor-pointer px-4 py-2 text-sm font-semibold transition-colors",
                    side === s
                      ? s === "buy"
                        ? "bg-buy text-black"
                        : "bg-sell text-white"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {t(s === "buy" ? "otc.buy" : "otc.sell")}
                </button>
              ))}
            </div>
            <Select value={coin} onChange={(v) => setCoin(v as OtcCoin)} options={COINS} />
            <Select value={fiat} onChange={(v) => setFiat(v as OtcFiat)} options={FIATS} />
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-muted">
              {`${t("otc.amount")} (${fiat})`}
              <input
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={t("otc.amountPlaceholder")}
                data-testid="express-amount"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
              />
            </label>
          </div>

          {/* 最优报价 */}
          {best && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-panel-2/40 px-4 py-3" data-testid="express-best">
              <div>
                <p className="text-xs text-muted">{t("otc.expressBest")}</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {best.merchant}
                  {best.verified && <span className="ml-1 text-accent">✓</span>}
                  <span className="ml-2 font-mono font-bold tabular-nums text-buy">
                    {fmtPrice(priced.get(best.id) ?? 0)} {fiat}
                  </span>
                </p>
              </div>
              <button
                onClick={() => onTrade(best, priced.get(best.id) ?? 0)}
                disabled={!amount}
                data-testid="express-go"
                className={cn(
                  "h-9 cursor-pointer rounded-lg px-5 text-sm font-semibold transition-all",
                  !amount ? "cursor-not-allowed opacity-50" : side === "buy" ? "bg-buy text-black hover:bg-buy/90" : "bg-sell text-white hover:bg-sell/90"
                )}
              >
                {t("otc.expressGo")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 自选区：完整筛选栏 */}
      {tab === "p2p" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3" data-testid="p2p-filters">
          <div className="flex overflow-hidden rounded-lg border border-border" role="group">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                data-testid={`p2p-${s}`}
                className={cn(
                  "cursor-pointer px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  side === s
                    ? s === "buy"
                      ? "bg-buy text-black"
                      : "bg-sell text-white"
                    : "text-muted hover:text-foreground"
                )}
              >
                {t(s === "buy" ? "otc.buy" : "otc.sell")}
              </button>
            ))}
          </div>
          <Select value={coin} onChange={(v) => setCoin(v as OtcCoin)} options={COINS} compact />
          <Select value={fiat} onChange={(v) => setFiat(v as OtcFiat)} options={FIATS} compact />
          <div className="flex items-center gap-1">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                data-testid={`method-${m}`}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                  method === m ? "border-accent bg-tag-bg text-accent" : "border-border text-muted hover:border-accent/50"
                )}
              >
                {m !== "all" && <MethodIcon method={m} />}
                {t(`otc.method.${m}`)}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            {t("otc.amount")}
            <input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("otc.amountPlaceholder")}
              data-testid="p2p-amount"
              className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 font-mono text-xs tabular-nums text-foreground outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      {/* 商家列表 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="merchant-list">
        {/* 表头（P2P 桌面端显示列头） */}
        {tab === "p2p" && (
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-3 border-b border-border px-4 py-2 text-[11px] text-muted md:grid">
            <span>{t("otc.merchant")}</span>
            <span>{t("otc.price")}</span>
            <span>{t("otc.available")}</span>
            <span>{t("otc.limits")}</span>
            <span className="w-24 text-right">{t("otc.payMethod")}</span>
          </div>
        )}
        {ads.length === 0 && (
          <p className="py-12 text-center text-sm text-muted" data-testid="no-ads">
            {t("otc.noAds")}
          </p>
        )}
        {ads.map((a) => {
          const p = priced.get(a.id) ?? 0;
          return (
            <div
              key={a.id}
              className="grid grid-cols-2 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 transition-colors hover:bg-panel-2/30 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
              data-testid={`ad-${a.id}`}
            >
              {/* 商家 */}
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tag-bg text-sm font-bold text-accent">
                  {a.merchant.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {a.merchant}
                    {a.verified && <span className="ml-1 text-xs text-accent">✓</span>}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {t("otc.trades", { n: a.trades.toLocaleString() })} · {t("otc.successRate", { r: a.successRate })}
                  </p>
                </div>
              </div>
              {/* 单价 */}
              <div>
                <p className={cn("font-mono text-base font-bold tabular-nums", a.side === "buy" ? "text-buy" : "text-sell")}>
                  {fmtPrice(p)}
                </p>
                <p className="text-[11px] text-muted md:hidden">{fmtQty(a.available)} {a.coin}</p>
              </div>
              {/* 可用数量 */}
              <div className="hidden font-mono text-sm tabular-nums md:block">
                {fmtQty(a.available)} {a.coin}
              </div>
              {/* 限额 */}
              <div className="hidden font-mono text-xs tabular-nums text-muted md:block">
                {a.minLimit.toLocaleString()} - {a.maxLimit.toLocaleString()} {a.fiat}
              </div>
              {/* 支付方式 + 按钮 */}
              <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:flex-col md:items-end">
                <div className="flex items-center gap-1 text-muted">
                  {a.methods.map((m) => (
                    <span key={m} title={t(`otc.method.${m}`)}>
                      <MethodIcon method={m} />
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onTrade(a, p)}
                  data-testid={`trade-${a.id}`}
                  className={cn(
                    "h-8 w-24 shrink-0 cursor-pointer rounded-lg text-xs font-semibold transition-all",
                    a.side === "buy" ? "bg-buy text-black hover:bg-buy/90" : "bg-sell text-white hover:bg-sell/90"
                  )}
                >
                  {t(a.side === "buy" ? "otc.buy" : "otc.sell")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Select({ value, onChange, options, compact }: { value: string; onChange: (v: string) => void; options: readonly string[]; compact?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-background font-mono text-sm text-foreground outline-none focus:border-accent",
        compact ? "h-8 px-2 text-xs" : "h-9 px-2.5"
      )}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
