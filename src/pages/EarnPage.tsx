// 理财（Earn Hub）：活期/定期产品列表 + 申购计算器弹窗 + 我的持仓。
// 产品/持仓来自 /api/v1/earn/*；利息由服务端按读取时刻实时累计。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { api, ApiError, type EarnProduct, type EarnSubscription } from "../api/client";
import { useAuth } from "../lib/auth";
import { dailyIncome, estIncome, fmtAPY } from "../lib/earn-utils";
import { cn } from "../lib/utils";

const TERMS: { key: string; label: string; param?: string }[] = [
  { key: "all", label: "earn.term.all" },
  { key: "flexible", label: "earn.term.flexible", param: "flexible" },
  { key: "7", label: "earn.term.7d", param: "7" },
  { key: "30", label: "earn.term.30d", param: "30" },
  { key: "120", label: "earn.term.120d", param: "120" },
];

export function EarnPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { uid } = useAuth();
  const authed = !!uid;

  const [term, setTerm] = useState("all");
  const [products, setProducts] = useState<EarnProduct[]>([]);
  const [subs, setSubs] = useState<EarnSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<EarnProduct | null>(null);

  const loadProducts = useCallback((termKey: string) => {
    setLoading(true);
    setError(null);
    const param = TERMS.find((x) => x.key === termKey)?.param;
    api
      .earnProducts(param)
      .then(setProducts)
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadSubs = useCallback(() => {
    if (!uid) {
      setSubs([]);
      return;
    }
    api
      .earnSubscriptions()
      .then(setSubs)
      .catch(() => {});
  }, [uid]);

  useEffect(() => loadProducts(term), [term, loadProducts]);
  useEffect(() => {
    loadSubs();
    // 持仓利息实时累计：10s 轮询刷新
    const id = setInterval(loadSubs, 10000);
    return () => clearInterval(id);
  }, [loadSubs]);

  const redeem = async (s: EarnSubscription) => {
    try {
      const r = await api.earnRedeem(s.id);
      toast.success(t("earn.redeemedToast", { amount: r.redeemed_amount ?? s.amount, asset: s.asset }));
      loadSubs();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("earn.actionFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold">{t("earn.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("earn.subtitle")}</p>
      </div>

      {/* 期限筛选 Tab */}
      <div className="mb-3 flex gap-5 border-b border-border px-1">
        {TERMS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTerm(key)}
            data-testid={`term-${key}`}
            className={cn(
              "relative cursor-pointer pb-2.5 text-[13px] transition-colors",
              term === key ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            )}
          >
            {t(label)}
            {term === key && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* 产品列表 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="earn-list">
        <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-3 border-b border-border px-4 py-2 text-[11px] text-muted md:grid">
          <span>{t("earn.colAsset")}</span>
          <span>{t("earn.colApy")}</span>
          <span>{t("earn.colTerm")}</span>
          <span>{t("earn.colMin")}</span>
          <span className="w-24 text-right">{t("earn.colAction")}</span>
        </div>
        {loading && (
          <div className="space-y-3 p-4" data-testid="earn-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-panel-2/50" />
            ))}
          </div>
        )}
        {!loading && error && (
          <p className="py-12 text-center text-sm text-sell" data-testid="earn-error">
            {t("earn.loadFailed")} · {error}
          </p>
        )}
        {!loading && !error && products.length === 0 && (
          <p className="py-12 text-center text-sm text-muted">—</p>
        )}
        {products.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-2 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 transition-colors hover:bg-panel-2/30 md:grid-cols-[1.6fr_1fr_1fr_1fr_auto]"
            data-testid={`product-${p.asset}-${p.term_days}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tag-bg text-xs font-bold text-accent">
                {p.asset.slice(0, 4)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-[11px] text-muted">{t("earn.limitMax", { n: p.max_amount.toLocaleString(), asset: p.asset })}</p>
              </div>
            </div>
            <div>
              <p className="font-mono text-lg font-bold tabular-nums text-accent" data-testid={`apy-${p.asset}-${p.term_days}`}>
                {fmtAPY(p.apy)}
              </p>
              <p className="text-[11px] text-muted">{t("earn.apyLabel")}</p>
            </div>
            <div>
              <Badge variant={p.term_days === 0 ? "success" : "default"}>
                {p.term_days === 0 ? t("earn.term.flexible") : t("earn.termDays", { d: p.term_days })}
              </Badge>
            </div>
            <div className="hidden font-mono text-xs tabular-nums text-muted md:block">
              {p.min_amount} {p.asset}
            </div>
            <div className="col-span-2 flex justify-end md:col-span-1">
              <button
                onClick={() => setModalProduct(p)}
                data-testid={`subscribe-${p.asset}-${p.term_days}`}
                className="h-8 w-24 cursor-pointer rounded-lg bg-accent text-xs font-semibold text-black transition-all hover:bg-accent-hover"
              >
                {t("earn.subscribe")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 我的持仓 */}
      {authed && (
        <div className="mt-6">
          <h2 className="mb-2 text-base font-bold">{t("earn.myHoldings")}</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="my-holdings">
            {subs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t("earn.noHoldings")}</p>
            ) : (
              subs.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-2 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 transition-colors hover:bg-panel-2/30 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
                  data-testid={`holding-${s.id}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tag-bg text-xs font-bold text-accent">
                      {s.asset.slice(0, 4)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{s.asset}</p>
                      <p className="font-mono text-[11px] tabular-nums text-muted">{fmtAPY(s.apy)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold tabular-nums">{s.amount.toLocaleString()}</p>
                    <p className="text-[11px] text-muted">{t("earn.principal")}</p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold tabular-nums text-buy" data-testid={`accrued-${s.id}`}>
                      +{(s.accrued ?? 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </p>
                    <p className="text-[11px] text-muted">{t("earn.accrued")}</p>
                  </div>
                  <div>
                    <Badge variant={s.status === "active" ? "success" : "default"}>
                      {t(s.status === "active" ? "earn.statusActive" : "earn.statusRedeemed")}
                    </Badge>
                  </div>
                  <div className="col-span-2 flex justify-end md:col-span-1">
                    {s.status === "active" && (
                      <Button
                        variant="sell"
                        size="sm"
                        data-testid={`redeem-${s.id}`}
                        onClick={() =>
                          void confirm({ message: t("earn.confirmRedeem"), danger: true }).then((ok) => {
                            if (ok) void redeem(s);
                          })
                        }
                      >
                        {t("earn.redeem")}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {modalProduct && (
        <SubscribeModal
          product={modalProduct}
          authed={authed}
          onDone={() => {
            setModalProduct(null);
            loadSubs();
          }}
          onClose={() => setModalProduct(null)}
        />
      )}
    </div>
  );
}

function SubscribeModal({
  product,
  authed,
  onDone,
  onClose,
}: {
  product: EarnProduct;
  authed: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [amountStr, setAmountStr] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const amount = parseFloat(amountStr) || 0;
  const daily = useMemo(() => dailyIncome(amount, product.apy), [amount, product.apy]);
  const monthly = useMemo(() => estIncome(amount, product.apy, 30), [amount, product.apy]);
  const valid = amount >= product.min_amount && amount <= product.max_amount;

  const submit = async () => {
    if (!valid || !agreed || submitting) return;
    setSubmitting(true);
    try {
      await api.earnSubscribe({ product_id: product.id, amount, agreed: true });
      toast.success(t("earn.subscribedToast"));
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("earn.actionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t("earn.calcTitle")} onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 p-1 text-sm">
        {/* 产品摘要 */}
        <div className="flex items-center justify-between rounded-lg bg-panel-2/40 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">{product.name}</span>
          <span className="font-mono font-bold tabular-nums text-accent">{fmtAPY(product.apy)}</span>
        </div>

        {/* 申购金额 */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {`${t("earn.amount")} (${product.asset})`}
          <input
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={`${t("earn.minAmount")} ${product.min_amount}`}
            data-testid="earn-amount"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground outline-none focus:border-accent"
          />
        </label>

        {/* 收益试算 */}
        <div className="rounded-lg border border-border p-3" data-testid="calc-panel">
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("earn.dailyIncome")}</dt>
              <dd className="font-mono font-bold tabular-nums text-buy" data-testid="daily-income">
                +{daily.toLocaleString(undefined, { maximumFractionDigits: 8 })} {product.asset}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("earn.monthlyIncome")}</dt>
              <dd className="font-mono tabular-nums text-buy">
                +{monthly.toLocaleString(undefined, { maximumFractionDigits: 8 })} {product.asset}
              </dd>
            </div>
          </dl>
        </div>

        {amount > 0 && !valid && (
          <p className="text-xs text-sell" role="alert">
            {`${t("earn.minAmount")} ${product.min_amount} · ${t("earn.maxAmount")} ${product.max_amount.toLocaleString()} ${product.asset}`}
          </p>
        )}

        {/* 协议勾选 */}
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted" data-testid="agreement-row">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            data-testid="agree-checkbox"
            className="mt-0.5 size-3.5 cursor-pointer accent-[#FCD535]"
          />
          <span>
            {t("earn.agreePrefix")}
            <a className="text-accent underline-offset-2 hover:underline" href="#/earn" onClick={(e) => e.preventDefault()}>
              《{t("earn.agreement")}》
            </a>
          </span>
        </label>

        {authed ? (
          <Button disabled={!valid || !agreed || submitting} onClick={() => void submit()} data-testid="earn-submit">
            {t("earn.confirmSubscribe")}
          </Button>
        ) : (
          <a
            href="#/login"
            className="grid h-9 place-items-center rounded-lg bg-accent text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            {t("earn.loginToSubscribe")}
          </a>
        )}
      </div>
    </Modal>
  );
}
