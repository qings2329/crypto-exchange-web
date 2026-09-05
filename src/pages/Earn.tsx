import { useEffect, useState } from "react";
import { api, type EarnProduct, type EarnSubscription } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";
import { Button } from "../components/ui/button";
import { Modal } from "../components/Modal";
import { Badge } from "../components/ui/badge";

function fmtAPY(apy: number): string {
  return (apy * 100).toFixed(2) + "%";
}

function fmtDate(s: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

export function Earn() {
  const { t } = useI18n();
  const [products, setProducts] = useState<EarnProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<EarnSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"products" | "my">("products");

  // Subscribe form
  const [showSub, setShowSub] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<EarnProduct | null>(null);
  const [subAmount, setSubAmount] = useState("");
  const [agree, setAgree] = useState(false);
  const [subbing, setSubbing] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [ps, ss] = await Promise.all([api.earnProducts(), api.earnSubscriptions()]);
      setProducts(ps);
      setSubscriptions(ss);
    } catch (e: any) {
      setErr(e?.message ?? t("common.queryFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openSub = (p: EarnProduct) => {
    setSelectedProduct(p);
    setSubAmount("");
    setAgree(false);
    setShowSub(true);
    setMsg("");
  };

  const handleSub = async () => {
    if (!selectedProduct || !subAmount || parseFloat(subAmount) <= 0) {
      setMsg(t("earn.amountRequired"));
      return;
    }
    if (!agree) {
      setMsg(t("earn.agreeRequired"));
      return;
    }
    setSubbing(true);
    setMsg("");
    try {
      await api.earnSubscribe({
        product_id: selectedProduct.id,
        amount: parseFloat(subAmount),
        agreed: true,
      });
      setMsg(t("earn.subSuccess"));
      setShowSub(false);
      load();
    } catch (e: any) {
      setMsg(e?.message ?? t("earn.subFailed"));
    } finally {
      setSubbing(false);
    }
  };

  const handleRedeem = async (id: number) => {
    try {
      await api.earnRedeem(id);
      load();
    } catch { /* silent */ }
  };

  const activeSubs = subscriptions.filter((s) => s.status === "active");

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("earn.title")}</h2>
      </div>
      <InlineError err={err} />
      {msg && <div className={`ok ${msg.includes("失败") ? "" : ""}`}>{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 mb-4">
        {(["products", "my"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === tb ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {tb === "products" ? t("earn.tabProducts") : t("earn.tabMy")}
          </button>
        ))}
      </div>

      {/* Products */}
      {tab === "products" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading && <div className="muted col-span-full">{t("common.loading")}</div>}
          {!loading && products.length === 0 && (
            <div className="muted col-span-full">{t("earn.noProducts")}</div>
          )}
          {!loading && products.map((p) => (
            <div key={p.id} className="card">
              <div className="card-head">
                <span className="font-semibold">{p.name}</span>
                <Badge variant={p.status === "open" ? "success" : "outline"}>
                  {p.status === "open" ? t("earn.statusOpen") : t("earn.statusClosed")}
                </Badge>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("earn.colAsset")}</span>
                  <span className="font-medium">{p.asset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("earn.colAPY")}</span>
                  <span className="font-semibold text-success">{fmtAPY(p.apy)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("earn.colTerm")}</span>
                  <span className="font-medium">{p.term_days === 0 ? t("earn.flexible") : p.term_days + " " + t("earn.days")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("earn.colMin")}</span>
                  <span className="font-medium">${p.min_amount.toFixed(2)}</span>
                </div>
                {p.max_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("earn.colMax")}</span>
                    <span className="font-medium">${p.max_amount.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="pt-3">
                {p.status === "open" ? (
                  <Button className="w-full h-8 text-xs bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-semibold" onClick={() => openSub(p)}>
                    {t("earn.subscribe")}
                  </Button>
                ) : (
                  <Button className="w-full h-8 text-xs" variant="outline" disabled>
                    {t("earn.closed")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My subscriptions */}
      {tab === "my" && (
        <div className="space-y-2">
          {loading && <div className="muted">{t("common.loading")}</div>}
          {!loading && activeSubs.length === 0 && (
            <div className="muted">{t("earn.noSubscriptions")}</div>
          )}
          {activeSubs.map((s) => {
            const prod = products.find((p) => p.id === s.product_id);
            return (
              <div key={s.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{prod?.name ?? `Product #${s.product_id}`}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s.asset} · {t("earn.colAPY")}: <span className="text-success font-semibold">{fmtAPY(s.apy ?? 0)}</span>
                    · {t("earn.colStart")}: {fmtDate(s.start_at)}
                    {prod?.term_days ? ` · ${t("earn.colTerm")}: ${prod.term_days}${t("earn.days")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold num">${s.amount?.toFixed(2) ?? "0.00"}</div>
                    <div className="text-[11px] text-success">+{s.accrued?.toFixed(4) ?? "0.0000"}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleRedeem(s.id)}>
                    {t("earn.redeem")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subscribe modal */}
      {showSub && selectedProduct && (
        <Modal
          title={t("earn.subscribe")}
          onClose={() => setShowSub(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowSub(false)}>{t("common.cancel")}</Button>
              <Button className="gap-1.5" onClick={handleSub} disabled={subbing || !agree}>
                {subbing ? t("earn.subscribing") : t("earn.confirmSubscribe")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("earn.colAsset")}</span>
                <span className="font-medium">{selectedProduct.asset}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("earn.colAPY")}</span>
                <span className="font-semibold text-success">{fmtAPY(selectedProduct.apy)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("earn.colTerm")}</span>
                <span className="font-medium">{selectedProduct.term_days === 0 ? t("earn.flexible") : selectedProduct.term_days + " " + t("earn.days")}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("earn.colAmount")}</label>
              <input
                className="input w-full"
                type="number"
                step="0.01"
                min={selectedProduct.min_amount}
                placeholder={`${t("earn.minAmount")}: ${selectedProduct.min_amount}`}
                value={subAmount}
                onChange={(e) => setSubAmount(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              {t("earn.agreeTerms")}
            </label>
            {msg && <p className={`text-xs ${msg.includes("成功") ? "text-success" : "text-destructive"}`}>{msg}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
