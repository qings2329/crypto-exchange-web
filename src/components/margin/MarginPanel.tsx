// 杠杆账户面板：借币 / 还款 / 账户概览（契约对齐 Go internal/margin）。
// - 借入：抵押 USDT = 数量 ÷ 杠杆（冻结）；同一资产仅允许一个活跃账户；
// - 还款：先冲本金后冲利息，超额自动截断；还清解冻抵押并关户；
// - 强平价 = 抵押 ÷ (债务 × 1.05)，借入资产以 USDT 计价上穿该价触发强平。

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type MarginAccount } from "../../api/client";
import { useI18n } from "../../i18n";
import { InlineError } from "../InlineError";
import { cn } from "../../lib/utils";

export const MARGIN_MAX_LEV = 5;
const MARGIN_ASSETS = ["BTC", "ETH"] as const;

/** 借入数量输入步进：与现货下单一致的网格粒度。 */
function roundAmount(n: number): number {
  return Math.floor(n * 10000) / 10000;
}

interface Props {
  /** 预选借入资产（如从交易对推导 BTCUSDT → BTC）；用户可切换 */
  defaultAsset?: string;
}

export function MarginPanel({ defaultAsset }: Props) {
  const { t } = useI18n();
  const [asset, setAsset] = useState(
    MARGIN_ASSETS.includes((defaultAsset ?? "").toUpperCase() as (typeof MARGIN_ASSETS)[number])
      ? (defaultAsset as string).toUpperCase()
      : "BTC"
  );
  const [account, setAccount] = useState<MarginAccount | undefined>(undefined);
  const [accErr, setAccErr] = useState<unknown>(undefined);
  const [liqPrice, setLiqPrice] = useState<number | undefined>(undefined);

  // ---- 借币表单 ----
  const [amountStr, setAmountStr] = useState("");
  const [leverage, setLeverage] = useState(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // ---- 还款表单 ----
  const [repayStr, setRepayStr] = useState("");

  const amount = parseFloat(amountStr) || 0;

  const loadAccount = useCallback(async () => {
    try {
      const a = await api.marginAccount(asset);
      setAccount(a);
      setAccErr(undefined);
      if (a.status === "active" && a.totalOwed > 0) {
        try {
          setLiqPrice(await api.marginLiqPrice(asset));
        } catch {
          setLiqPrice(undefined);
        }
      } else {
        setLiqPrice(undefined);
      }
    } catch (e) {
      setAccount(undefined);
      setAccErr(e);
    }
  }, [asset]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const doBorrow = async () => {
    if (busy || !(amount > 0)) return;
    setBusy(true);
    setMsg("");
    try {
      const a = await api.marginBorrow({ asset, amount: roundAmount(amount), leverage });
      setAccount(a);
      setMsg(t("margin.borrowOk"));
      setAmountStr("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doRepay = async (all: boolean) => {
    const amt = all ? account?.totalOwed ?? 0 : parseFloat(repayStr) || 0;
    if (busy || !(amt > 0) || !account) return;
    setBusy(true);
    setMsg("");
    try {
      await api.marginRepay({ asset, amount: roundAmount(Math.min(amt, account.totalOwed)) });
      setMsg("");
      setRepayStr("");
      await loadAccount();
      setMsg(t("margin.repayOk"));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const collateralRequired = amount > 0 ? Math.ceil((amount / leverage) * 100) / 100 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4" data-testid="margin-panel">
      {/* 标题 + 资产切换 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("margin.accountTitle")}</h3>
        <div className="flex gap-1 rounded-lg border border-neutral-800 p-0.5">
          {MARGIN_ASSETS.map((a) => (
            <button
              key={a}
              onClick={() => setAsset(a)}
              data-testid={`margin-asset-${a}`}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                asset === a ? "bg-accent/15 font-semibold text-accent" : "text-muted hover:text-foreground"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">{t("margin.subtitle")}</p>

      {/* 404 = 无活跃账户（正常空态），其余错误走 InlineError */}
      {!account &&
        (!(accErr instanceof ApiError) || accErr.status !== 404) && (
          <InlineError err={accErr} />
        )}

      {!account ? (
        <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-2 text-xs text-muted" data-testid="margin-empty">
          {t("margin.noAccount")}
        </div>
      ) : (
        /* 账户概览卡片 */
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 text-xs" data-testid="margin-account-card">
          <Stat label={t("margin.collateral")} value={account.collateral.toLocaleString()} />
          <Stat label={`${t("margin.leverage")} · ${account.leverage}x`} value={`${account.leverage}x`} />
          <Stat label={t("margin.debt")} value={account.debt.toString()} />
          <Stat label={t("margin.interest")} value={account.interest.toString()} />
          <Stat label={t("margin.totalOwed")} value={account.totalOwed.toString()} tone="sell" />
          <Stat
            label={t("margin.estLiqPrice")}
            value={liqPrice !== undefined ? liqPrice.toLocaleString() : "--"}
            tone="sell"
            testId="margin-liq-price"
          />
        </dl>
      )}

      {/* 借币表单（无活跃账户或已有账户均可再次查看；有活跃账户时禁用） */}
      <fieldset className="flex flex-col gap-2" disabled={!!account}>
        <legend className="text-xs font-medium text-muted">{t("margin.borrow")}</legend>
        <label className="text-xs text-muted">
          {t("margin.amount")}
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            data-testid="margin-borrow-amount"
          />
        </label>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{t("margin.leverage")}</span>
          {[1, 2, 3, 5].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLeverage(l)}
              data-testid={`margin-lev-${l}`}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-0.5 transition-colors",
                leverage === l
                  ? "border-accent/60 font-semibold text-accent"
                  : "border-neutral-800 text-muted hover:text-foreground"
              )}
            >
              {l}x
            </button>
          ))}
          <span className="ml-auto">{t("margin.maxLeverage", { n: MARGIN_MAX_LEV })}</span>
        </div>
        {collateralRequired > 0 && (
          <div className="text-xs text-muted" data-testid="margin-collateral-required">
            {t("margin.collateralRequired")}: ≈ {collateralRequired.toLocaleString()} USDT
          </div>
        )}
        <button
          type="button"
          className="btn primary w-full"
          onClick={() => void doBorrow()}
          disabled={busy || !(amount > 0) || !!account}
          data-testid="margin-borrow-btn"
        >
          {busy ? t("common.loading") : t("margin.submitBorrow")}
        </button>
      </fieldset>

      {/* 还款表单 */}
      {account && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted">{t("margin.repay")}</legend>
          <label className="text-xs text-muted">
            {t("margin.amount")}
            <input
              value={repayStr}
              onChange={(e) => setRepayStr(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={`≤ ${account.totalOwed}`}
              inputMode="decimal"
              data-testid="margin-repay-amount"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn primary flex-1"
              onClick={() => void doRepay(false)}
              disabled={busy || !(parseFloat(repayStr) > 0)}
              data-testid="margin-repay-btn"
            >
              {busy ? t("common.loading") : t("margin.submitRepay")}
            </button>
            <button
              type="button"
              className="btn flex-none"
              onClick={() => void doRepay(true)}
              disabled={busy || !(account.totalOwed > 0)}
              data-testid="margin-repay-all"
            >
              {t("margin.repayAll")}
            </button>
          </div>
        </fieldset>
      )}

      {msg === t("margin.borrowOk") || msg === t("margin.repayOk") ? (
        <div className="ok" role="status">{msg}{account?.totalOwed === 0 ? ` ${t("margin.closedTip")}` : ""}</div>
      ) : msg ? (
        <div className="error" role="alert">{msg}</div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: "buy" | "sell"; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-foreground"
        )}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
