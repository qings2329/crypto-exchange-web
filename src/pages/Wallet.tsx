import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, tokenStore, type AddressBookEntry, type LedgerEntry } from "../api/client";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { isPublicRoute } from "../lib/routes";
import { formatDateTime } from "../lib/timezone";
import { isValidCryptoAddress, validateAmount } from "../lib/validate";
import { demoDepositAddress } from "../lib/deposit-address";
import { AssetOverview, TransferModal, type WalletRow } from "../components/wallet/AssetOverview";
import { AssetCards, type AssetCardRow } from "../components/wallet/AssetCards";
import { useSecureAction } from "../components/security/SecureActionProvider";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { SecureText } from "../components/security/SecureText";
import { InlineError } from "../components/InlineError";
import { useToast } from "../components/Toast";

const BALANCE_EP = "/api/v1/futures/wallet/balance";
const WITHDRAWS_EP = "/api/v1/futures/wallet/withdraws";

// 资金流水业务类型 -> 文案 key（对齐 wallet.biz.*）。
const BIZ_KEY: Record<string, string> = {
  deposit: "wallet.biz.deposit",
  withdraw: "wallet.biz.withdraw",
  transfer: "wallet.biz.transfer",
  funding: "wallet.biz.funding",
  liquidation: "wallet.biz.liquidation",
  repay: "wallet.biz.repay",
  open: "wallet.biz.open",
  close: "wallet.biz.close",
  fee: "wallet.biz.fee",
};

function bizLabel(t: (k: string) => string, biz: string): string {
  return BIZ_KEY[biz] ? t(BIZ_KEY[biz]) : biz;
}

// 后端 Entry.Time 为 Unix 纳秒；统一按时区格式化展示。
function fmtNs(ts: number): string {
  return formatDateTime(ts);
}

// 渲染单元格：对象/数组折叠为 JSON，其余转字符串
function renderCell(v: unknown) {
  if (v === null || v === undefined) return "--";
  if (typeof v === "object") return <code className="mono">{JSON.stringify(v)}</code>;
  return String(v);
}

// 自适应表格：数组 -> 行；对象(值为对象) -> 资产 + 各字段列；对象(值为标量) -> 键值
function AdaptiveTable({ data }: { data: unknown }) {
  const { t } = useI18n();
  if (data === null || data === undefined) return <div className="muted">{t("common.noData")}</div>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <div className="muted">{t("common.noData")}</div>;
    const cols = new Set<string>();
    for (const row of data) {
      if (row && typeof row === "object") Object.keys(row as object).forEach((k) => cols.add(k));
    }
    const columns = [...cols];
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{renderCell((row as Record<string, unknown>)?.[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    const valuesAreObjects = entries.every(
      ([, v]) => v !== null && typeof v === "object" && !Array.isArray(v)
    );
    if (valuesAreObjects) {
      const cols = new Set<string>();
      for (const [, v] of entries) Object.keys(v as object).forEach((k) => cols.add(k));
      const columns = [t("wallet.col.asset"), ...cols];
      return (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(([asset, v]) => (
                <tr key={asset}>
                  <td>{asset}</td>
                  {[...cols].map((c) => (
                    <td key={c}>{renderCell((v as Record<string, unknown>)?.[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <div className="kv">
        {entries.map(([k, v]) => (
          <div className="kv-row" key={k}>
            <span className="kv-k">{k}</span>
            <span className="kv-v">{renderCell(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <div className="mono">{String(data)}</div>;
}

// 钱包：以合约钱包余额接口为统一资产视图（现货余额经撮合引擎内存态，无独立 HTTP 接口）。
export function Wallet() {
  const { uid } = useAuth();
  const { t } = useI18n();
  const secureAction = useSecureAction();
  const toast = useToast();
  const qc = useQueryClient();
  const [balance, setBalance] = useState<unknown>(undefined);
  const [balanceErr, setBalanceErr] = useState<unknown>(undefined);
  const [withdraws, setWithdraws] = useState<unknown>(undefined);
  const [withdrawsErr, setWithdrawsErr] = useState<unknown>(undefined);
  const [ledger, setLedger] = useState<LedgerEntry[] | undefined>(undefined);
  const [ledgerErr, setLedgerErr] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [b, w, l] = await Promise.allSettled([
      api.get(BALANCE_EP),
      api.get(WITHDRAWS_EP),
      api.walletLedger(),
    ]);
    if (b.status === "fulfilled") {
      setBalance(b.value);
      setBalanceErr(undefined);
    } else {
      // 传递错误对象而非仅 .message：保留 ApiError.status，
      // 使 InlineError 按状态码判定（401=未登录 / 403=权限不足），而非脆弱的正则兜底。
      setBalanceErr(b.reason);
    }
    if (w.status === "fulfilled") {
      setWithdraws(w.value);
      setWithdrawsErr(undefined);
    } else {
      setWithdrawsErr(w.reason);
    }
    if (l.status === "fulfilled") {
      setLedger(l.value as LedgerEntry[]);
      setLedgerErr(undefined);
    } else {
      setLedgerErr(l.reason);
    }
    setLoading(false);
    // 防御：余额 / 提现记录任一请求因会话失效而 401/403 时，立即清登录态并跳登录页，
    // 杜绝「顶栏仍显示已登录、钱包却提示请先登录以查看」的半死状态（组件级兜底，
    // 与 api/client 的 request() 统一失效处理互为冗余，确保任何路径都不会卡在钱包页）。
    const authFailed = [b, w].some(
      (r) =>
        r.status === "rejected" &&
        r.reason &&
        (r.reason.status === 401 || r.reason.status === 403)
    );
    if (authFailed) {
      tokenStore.clear();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:expired"));
      if (typeof location !== "undefined" && !isPublicRoute()) location.hash = "/login";
    }
  }, []);

  // 登录态（uid）变化时重新拉取：覆盖「会话过期后重新登录 / auth:expired 同步登出」
  // 等场景，避免 Wallet 挂载时遗留的 401 错误（「请先登录以查看」）一直残留不刷新。
  useEffect(() => {
    load();
  }, [load, uid]);

  // 提现记录客户端筛选（按任意字段文本匹配）
  const filteredWithdraws = useMemo(() => {
    if (!filter.trim() || !Array.isArray(withdraws)) return withdraws;
    const kw = filter.trim().toLowerCase();
    return (withdraws as unknown[]).filter((row) => JSON.stringify(row).toLowerCase().includes(kw));
  }, [filter, withdraws]);

  // 资金流水客户端筛选（按资产 / 业务类型文本匹配）
  const [ledgerFilter, setLedgerFilter] = useState("");
  const filteredLedger = useMemo(() => {
    if (!Array.isArray(ledger)) return [];
    const kw = ledgerFilter.trim().toLowerCase();
    if (!kw) return ledger;
    return ledger.filter(
      (e) =>
        e.asset.toLowerCase().includes(kw) ||
        bizLabel(t, e.biz_type).toLowerCase().includes(kw) ||
        e.biz_type.toLowerCase().includes(kw)
    );
  }, [ledger, ledgerFilter]);

  // ---- 提现表单 ----
  const [showForm, setShowForm] = useState(false);
  const [asset, setAsset] = useState("");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  // 冷静期提现：request 成功后进入 held 状态，倒计时归零后可放行上链或撤销解冻
  const [wdHold, setWdHold] = useState<{ id: string; left: number } | null>(null);
  useEffect(() => {
    if (!wdHold || wdHold.left <= 0) return;
    const timer = setInterval(() => {
      setWdHold((h) => (h && h.left > 0 ? { ...h, left: h.left - 1 } : h));
    }, 1000);
    return () => clearInterval(timer);
  }, [wdHold?.id, wdHold !== null]);
  const [addrErr, setAddrErr] = useState("");
  const [amtErr, setAmtErr] = useState("");
  // ---- 地址簿（白名单）----
  const [book, setBook] = useState<AddressBookEntry[]>([]);
  const [whitelist, setWhitelist] = useState(false);
  // ---- 首次地址核对：未在簿地址提交前需勾选"我已核对" ----
  const [addrConfirmed, setAddrConfirmed] = useState(false);

  const loadBook = useCallback(() => {
    api
      .addressBookList()
      .then((r) => {
        setBook(r.entries);
        setWhitelist(r.whitelist_active);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadBook();
  }, [loadBook]);

  // 当前输入地址是否已在白名单中
  const addressInBook = useMemo(
    () =>
      book.some((x) => x.address.toLowerCase() === address.trim().toLowerCase()),
    [book, address]
  );
  // 首次使用（非白名单地址）需要核对；白名单开启且未命中时直接禁止提交
  const needConfirm = isValidCryptoAddress(address) && !addressInBook;
  const addrBlocked = whitelist && isValidCryptoAddress(address) && !addressInBook;

  const onAddressChange = (v: string) => {
    setAddress(v);
    setAddrConfirmed(false);
    if (addrErr) setAddrErr("");
  };
  // 从地址簿快捷填充
  const pickFromBook = (e: AddressBookEntry) => {
    setAddress(e.address);
    setAsset(e.asset || asset);
    setNetwork(e.network || network);
    setAddrConfirmed(true); // 白名单内地址视为已核对
    setAddrErr("");
  };
  // 保存当前地址到地址簿
  const [savingBook, setSavingBook] = useState(false);
  const saveToBook = async () => {
    if (!isValidCryptoAddress(address)) return;
    setSavingBook(true);
    try {
      await api.addressBookAdd({ asset: asset || "USDT", network: network || undefined, address: address.trim(), label: "" });
      loadBook();
      setAddrConfirmed(true);
    } catch (e) {
      // 重复添加等错误给出反馈（白名单刷新后 addrBlocked 自然解除）
      toast.error(e instanceof Error && e.message ? e.message : t("common.requestFailed"));
      loadBook();
    } finally {
      setSavingBook(false);
    }
  };
  const onAmountChange = (v: string) => {
    setAmount(v);
    if (amtErr) setAmtErr("");
  };

  // 从余额数据推导可选资产（对象取 key；数组取 asset 字段）
  const assetOptions = useMemo(() => {
    const d = balance;
    if (!d || typeof d !== "object") return [];
    if (Array.isArray(d)) {
      return (d as Record<string, unknown>[])
        .map((r) => r?.asset)
        .filter((x): x is string => typeof x === "string");
    }
    return Object.keys(d as Record<string, unknown>);
  }, [balance]);

  const guardedSubmit = useGuardedAction(() => void doSubmitWithdraw(), {
    key: "withdraw-submit",
    cooldownMs: 3000,
    debounceMs: 500,
  });

  // ---- 充值（展示充值地址；模拟链上到账即时入账）----
  const [showDeposit, setShowDeposit] = useState(false);
  const [dAsset, setDAsset] = useState("");
  const [dAmount, setDAmount] = useState("");
  const [dNetwork, setDNetwork] = useState("");
  const [dSubmitting, setDSubmitting] = useState(false);
  const [dFormMsg, setDFormMsg] = useState("");
  const [dAmtErr, setDAmtErr] = useState("");
  const [dCopied, setDCopied] = useState(false);

  const openDepositForm = (asset?: string) => {
    if (asset) setDAsset(asset);
    else if (!dAsset) setDAsset(assetOptions[0] || "USDT");
    setShowDeposit(true);
  };
  // 充值地址：按 账户+资产+网络 确定性派生（演示），同一组合恒定不变
  const dAddr = useMemo(
    () => demoDepositAddress(tokenStore.uid, dAsset || "USDT", dNetwork || undefined),
    [dAsset, dNetwork]
  );
  const copyAddr = () => {
    navigator.clipboard?.writeText(dAddr).then(() => {
      setDCopied(true);
      setTimeout(() => setDCopied(false), 1500);
    });
  };
  // 划转：从卡片化列表取该资产的可用/冻结余额，打开划转弹窗
  const [trRow, setTrRow] = useState<WalletRow | null>(null);
  const openTransferForm = (asset: string) => {
    const row = Array.isArray(balance)
      ? (balance as AssetCardRow[]).find((r) => r.asset === asset)
      : undefined;
    if (row) setTrRow({ asset: row.asset, available: row.available, frozen: row.frozen });
  };
  // 提现高危操作：经滑块 + 2FA/邮箱验证码二次验证后展开表单并预填资产
  const openWithdrawForm = (asset: string) => {
    void secureAction.verify({ action: "withdraw" }).then((ok) => {
      if (!ok) return;
      setAsset(asset);
      setShowForm(true);
      setTimeout(
        () => document.getElementById("wallet-withdraw-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        60
      );
    });
  };
  const onDAmountChange = (v: string) => {
    setDAmount(v);
    if (dAmtErr) setDAmtErr("");
  };
  const doDeposit = async () => {
    setDFormMsg("");
    setDAmtErr("");
    if (!dAsset) {
      setDFormMsg(t("wallet.errForm"));
      return;
    }
    const amtRes = validateAmount(dAmount);
    if (!amtRes.ok) {
      setDAmtErr(t("wallet.errAmount"));
      return;
    }
    setDSubmitting(true);
    try {
      const r = await api.futuresDeposit({
        asset: dAsset,
        amount: amtRes.value as number,
        network: dNetwork || undefined,
      });
      setDFormMsg(t("wallet.deposited", { asset: r.asset }));
      setShowDeposit(false);
      setDAmount("");
      setDNetwork("");
      load();
    } catch (e) {
      setDFormMsg(t("wallet.fail", { err: (e as Error).message }));
    } finally {
      setDSubmitting(false);
    }
  };

  const doSubmitWithdraw = async () => {
    setFormMsg("");
    setAddrErr("");
    setAmtErr("");
    if (!asset) {
      setFormMsg(t("wallet.errForm"));
      return;
    }
    if (!isValidCryptoAddress(address)) {
      setAddrErr(t("wallet.errAddress"));
      return;
    }
    if (addrBlocked) {
      setAddrErr(t("wallet.errWhitelist"));
      return;
    }
    if (needConfirm && !addrConfirmed) {
      setAddrErr(t("wallet.errNeedCheck"));
      return;
    }
    const amtRes = validateAmount(amount);
    if (!amtRes.ok) {
      setAmtErr(t("wallet.errAmount"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.futuresWithdrawRequest({
        asset,
        address: address.trim(),
        amount: amtRes.value as number,
        network: network || undefined,
      });
      setWdHold({ id: r.hold_id, left: Math.max(0, r.hold_seconds) });
      setFormMsg(t("wallet.withdrawCooling", { seconds: r.hold_seconds }));
    } catch (e) {
      setFormMsg(t("wallet.fail", { err: (e as Error).message }));
    } finally {
      setSubmitting(false);
    }
  };

  const doFinalizeWithdraw = async () => {
    if (!wdHold) return;
    setSubmitting(true);
    setFormMsg("");
    try {
      const r = await api.futuresWithdrawFinalize(wdHold.id);
      setWdHold(null);
      // 保持表单展开以展示结果消息（收起会连同消息一起隐藏）
      setAmount("");
      setFormMsg(t("wallet.withdrawFinalized", { hash: r.tx_hash }));
      load();
    } catch (e) {
      setFormMsg(t("wallet.fail", { err: (e as Error).message }));
    } finally {
      setSubmitting(false);
    }
  };

  const doCancelWithdraw = async () => {
    if (!wdHold) return;
    setSubmitting(true);
    setFormMsg("");
    try {
      await api.futuresWithdrawCancel(wdHold.id);
      setWdHold(null);
      setFormMsg(t("wallet.withdrawCancelled"));
      load();
    } catch (e) {
      setFormMsg(t("wallet.fail", { err: (e as Error).message }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("wallet.title")}</h2>
        <div className="panel-tools">
          <button className="refresh" onClick={load} disabled={loading}>
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>
      </div>

      {/* 资产总览：总资产折算 + 分布饼图（纯汇总卡片）；充值/提现入口位于下方资产卡片 */}
      <AssetOverview />

      <section className="card">
        <h3>{t("wallet.balance")}</h3>
        {balanceErr ? (
          <InlineError err={balanceErr} />
        ) : balance === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : Array.isArray(balance) ? (
          <AssetCards rows={balance as AssetCardRow[]} onDeposit={openDepositForm} onWithdraw={openWithdrawForm} onTransfer={openTransferForm} />
        ) : (
          <AdaptiveTable data={balance} />
        )}
      </section>

      {/* 充值：展示充值地址（演示派生），模拟链上到账即时入账 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("wallet.deposit")}</h3>
          <button
            className="btn"
            data-testid="wallet-deposit-toggle"
            onClick={() => {
              if (showDeposit) {
                setShowDeposit(false);
                return;
              }
              openDepositForm();
            }}
          >
            {showDeposit ? t("otc.collapse") : t("wallet.deposit")}
          </button>
        </div>

        {showDeposit && (
          <div className="card">
            <div className="form-hint">{t("wallet.depositAddrHint")}</div>
            <label>
              {t("wallet.asset")}
              <input
                list="deposit-asset-options"
                value={dAsset}
                onChange={(e) => setDAsset(e.target.value)}
                placeholder={t("wallet.phAsset")}
              />
            </label>
            <datalist id="deposit-asset-options">
              {assetOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <label>
              {t("wallet.network")}
              <input value={dNetwork} onChange={(e) => setDNetwork(e.target.value)} placeholder={t("wallet.phNetwork")} />
            </label>

            {/* 充值地址：随资产/网络联动，一键复制 */}
            <label>
              {t("wallet.depositAddress")}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code
                  className="mono"
                  data-testid="wallet-deposit-address"
                  style={{ flex: 1, wordBreak: "break-all" }}
                >
                  {dAddr}
                </code>
                <button type="button" className="btn" data-testid="wallet-deposit-copy" onClick={copyAddr}>
                  {dCopied ? t("wallet.addrCopied") : t("wallet.addrCopy")}
                </button>
              </div>
            </label>

            {/* 演示入账：无需真实转账，模拟确认后余额即时到账 */}
            <div className="form-hint">{t("wallet.simulateCredit")}</div>
            <label>
              {t("wallet.amount")}
              <input
                value={dAmount}
                onChange={(e) => onDAmountChange(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              {dAmtErr && <div className="error">{dAmtErr}</div>}
            </label>
            <button className="btn primary" onClick={() => void doDeposit()} disabled={dSubmitting}>
              {dSubmitting ? t("common.loading") : t("wallet.submitDeposit")}
            </button>
            {dFormMsg && (
              <div className={dFormMsg.startsWith(t("wallet.fail", { err: "" })) ? "error" : "ok"}>
                {dFormMsg}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card" id="wallet-withdraw-section">
        <div className="card-head">
          <h3>{t("wallet.withdraws")}</h3>
          <input
            className="filter"
            placeholder={t("wallet.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="btn"
            data-testid="wallet-withdraw-toggle"
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                return;
              }
              // 高危操作拦截：提现需通过滑块 + 2FA/邮箱验证码二次验证
              void secureAction.verify({ action: "withdraw" }).then((ok) => {
                if (ok) setShowForm(true);
              });
            }}
          >
            {showForm ? t("otc.collapse") : t("wallet.withdraw")}
          </button>
        </div>

        {showForm && (
          <div className="card">
            <label>
              {t("wallet.asset")}
              <input
                list="asset-options"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder={t("wallet.phAsset")}
              />
            </label>
            <datalist id="asset-options">
              {assetOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            {whitelist && (
              <div className="ok" data-testid="withdraw-whitelist-hint">
                🔒 {t("wallet.whitelistOn", { n: book.length })}
              </div>
            )}
            <label>
              {t("wallet.address")}
              <input value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder={t("wallet.phAddress")} />
              {book.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="withdraw-book-chips">
                  {book.slice(0, 4).map((e) => (
                    <button type="button" key={e.id} className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => pickFromBook(e)} title={`${e.label} · ${e.network || ""} · ${e.address.slice(0, 10)}…`}>
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
              {address.length >= 8 && (
                <>
                  <div className="mono" data-testid="withdraw-address-masked">
                    {t("wallet.addressConfirm")}{" "}
                    <SecureText value={address} mask maskOpts={{ leading: 6, trailing: 6 }} />
                  </div>
                  {/* 首次使用的地址：强制人工核对 */}
                  {needConfirm && !addrBlocked && (
                    <label className="checkbox" data-testid="withdraw-first-confirm">
                      <input type="checkbox" checked={addrConfirmed} onChange={(e) => setAddrConfirmed(e.target.checked)} />
                      {t("wallet.checkFirstUse")}
                    </label>
                  )}
                  {!addressInBook && isValidCryptoAddress(address) && (
                    <button type="button" className="btn" onClick={() => void saveToBook()} disabled={savingBook}>
                      {savingBook ? t("common.loading") : t("wallet.saveToBook")}
                    </button>
                  )}
                </>
              )}
              {addrErr && <div className="error">{addrErr}</div>}
            </label>
            <label>
              {t("wallet.amount")}
              <input
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              {amtErr && <div className="error">{amtErr}</div>}
            </label>
            <label>
              {t("wallet.network")}
              <input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder={t("wallet.phNetwork")} />
            </label>
            <button className="btn primary" onClick={() => guardedSubmit.run()} disabled={submitting || guardedSubmit.cooling}>
              {submitting || guardedSubmit.cooling
                ? t("common.loading")
                : t("wallet.submitWithdraw")}
            </button>
            {formMsg && (
              <div className={formMsg.startsWith(t("wallet.fail", { err: "" })) ? "error" : "ok"}>
                {formMsg}
              </div>
            )}
            {wdHold && (
              <div className="panel" data-testid="withdraw-cooling" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" data-testid="withdraw-cooling-countdown">
                  {wdHold.left > 0
                    ? t("wallet.withdrawCoolingLeft", { seconds: wdHold.left })
                    : t("wallet.withdrawReady")}
                </span>
                <button className="btn" onClick={doFinalizeWithdraw} disabled={submitting || wdHold.left > 0}>
                  {t("wallet.withdrawRelease")}
                </button>
                <button className="btn" onClick={doCancelWithdraw} disabled={submitting}>
                  {t("wallet.withdrawCancelTx")}
                </button>
              </div>
            )}
          </div>
        )}

        {withdrawsErr ? (
          <InlineError err={withdrawsErr} />
        ) : withdraws === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : Array.isArray(withdraws) && (withdraws as unknown[]).length === 0 ? (
          <div className="muted">{t("wallet.noWithdraws")}</div>
        ) : (
          <AdaptiveTable data={filteredWithdraws} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("wallet.ledger")}</h3>
          <input
            className="filter"
            placeholder={t("wallet.ledgerFilterPlaceholder")}
            value={ledgerFilter}
            onChange={(e) => setLedgerFilter(e.target.value)}
          />
        </div>
        {ledgerErr ? (
          <InlineError err={ledgerErr} />
        ) : ledger === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : filteredLedger.length === 0 ? (
          <div className="muted">{t("wallet.noLedger")}</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("wallet.col.time")}</th>
                  <th>{t("wallet.col.asset")}</th>
                  <th>{t("wallet.col.type")}</th>
                  <th>{t("wallet.col.delta")}</th>
                  <th>{t("wallet.col.balance")}</th>
                  <th>{t("wallet.col.ref")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtNs(e.time)}</td>
                    <td>{e.asset}</td>
                    <td>{bizLabel(t, e.biz_type)}</td>
                    <td className="ostatus">
                      {e.delta >= 0 ? "+" : ""}
                      {e.delta.toLocaleString()}
                    </td>
                    <td>{e.balance.toLocaleString()}</td>
                    <td className="mono">{e.ref || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 划转弹窗：资金账户 ⇄ 合约保证金 */}
      {trRow && (
        <TransferModal
          row={trRow}
          t={t}
          onClose={() => setTrRow(null)}
          onDone={async () => {
            setTrRow(null);
            await qc.invalidateQueries({ queryKey: ["wallet-balance"] });
            toast.success(t("wallet.transferCompleted"));
            load();
          }}
        />
      )}
    </div>
  );
}
