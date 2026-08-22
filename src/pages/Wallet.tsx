import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AddressBookEntry, type LedgerEntry } from "../api/client";
import { useI18n } from "../i18n";
import { formatDateTime } from "../lib/timezone";
import { isValidCryptoAddress, validateAmount } from "../lib/validate";
import { AssetOverview } from "../components/wallet/AssetOverview";
import { useSecureAction } from "../components/security/SecureActionProvider";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { SecureText } from "../components/security/SecureText";

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
  const { t } = useI18n();
  const secureAction = useSecureAction();
  const [balance, setBalance] = useState<unknown>(undefined);
  const [balanceErr, setBalanceErr] = useState("");
  const [withdraws, setWithdraws] = useState<unknown>(undefined);
  const [withdrawsErr, setWithdrawsErr] = useState("");
  const [ledger, setLedger] = useState<LedgerEntry[] | undefined>(undefined);
  const [ledgerErr, setLedgerErr] = useState("");
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
      setBalanceErr("");
    } else {
      setBalanceErr((b.reason as Error).message);
    }
    if (w.status === "fulfilled") {
      setWithdraws(w.value);
      setWithdrawsErr("");
    } else {
      setWithdrawsErr((w.reason as Error).message);
    }
    if (l.status === "fulfilled") {
      setLedger(l.value as LedgerEntry[]);
      setLedgerErr("");
    } else {
      setLedgerErr((l.reason as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch {
      // 重复添加等错误静默；白名单刷新后 addrBlocked 自然解除
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
      const r = await api.futuresWithdraw({
        asset,
        address: address.trim(),
        amount: amtRes.value as number,
        network: network || undefined,
      });
      setFormMsg(t("wallet.submitted", { id: r.order_id }));
      setShowForm(false);
      setAsset("");
      setAddress("");
      setAmount("");
      setNetwork("");
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
        <button className="refresh" onClick={load} disabled={loading}>
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      {/* 资产总览：总资产折算 + 分布饼图 + 资产列表快捷操作 */}
      <AssetOverview />

      <section className="card">
        <h3>{t("wallet.balance")}</h3>
        {balanceErr ? (
          <div className="error">{t("common.loadError", { err: balanceErr })}</div>
        ) : balance === undefined ? (
          <div className="muted">{t("common.loading")}</div>
        ) : (
          <AdaptiveTable data={balance} />
        )}
      </section>

      <section className="card">
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
            {showForm ? t("otc.collapse") : t("wallet.applyWithdraw")}
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
          </div>
        )}

        {withdrawsErr ? (
          <div className="error">{t("common.loadError", { err: withdrawsErr })}</div>
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
          <div className="error">{t("common.loadError", { err: ledgerErr })}</div>
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
    </div>
  );
}
