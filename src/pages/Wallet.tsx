import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const BALANCE_EP = "/api/v1/futures/wallet/balance";
const WITHDRAWS_EP = "/api/v1/futures/wallet/withdraws";

// 渲染单元格：对象/数组折叠为 JSON，其余转字符串
function renderCell(v: unknown) {
  if (v === null || v === undefined) return "--";
  if (typeof v === "object") return <code className="cell-json">{JSON.stringify(v)}</code>;
  return String(v);
}

// 自适应表格：数组 -> 行；对象(值为对象) -> 资产 + 各字段列；对象(值为标量) -> 键值
function AdaptiveTable({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <div className="muted">无数据</div>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <div className="muted">无数据</div>;
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
      const columns = ["资产", ...cols];
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

  return <div className="cell-json">{String(data)}</div>;
}

// 钱包：以合约钱包余额接口为统一资产视图（现货余额经撮合引擎内存态，无独立 HTTP 接口）。
export function Wallet() {
  const [balance, setBalance] = useState<unknown>(undefined);
  const [balanceErr, setBalanceErr] = useState("");
  const [withdraws, setWithdraws] = useState<unknown>(undefined);
  const [withdrawsErr, setWithdrawsErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [b, w] = await Promise.allSettled([api.get(BALANCE_EP), api.get(WITHDRAWS_EP)]);
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

  // ---- 提现表单 ----
  const [showForm, setShowForm] = useState(false);
  const [asset, setAsset] = useState("");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState("");

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

  const submitWithdraw = async () => {
    setFormMsg("");
    const amt = parseFloat(amount);
    if (!asset || !address || !amt || amt <= 0) {
      setFormMsg("请填写资产、地址和正确金额");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.futuresWithdraw({
        asset,
        address,
        amount: amt,
        network: network || undefined,
      });
      setFormMsg(`已提交，提现单号 ${r.order_id}`);
      setShowForm(false);
      setAsset("");
      setAddress("");
      setAmount("");
      setNetwork("");
      load();
    } catch (e) {
      setFormMsg(`提现失败：${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>钱包资产</h2>
        <button className="refresh" onClick={load} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <section className="card">
        <h3>余额</h3>
        {balanceErr ? (
          <div className="error">加载失败：{balanceErr}</div>
        ) : balance === undefined ? (
          <div className="muted">加载中…</div>
        ) : (
          <AdaptiveTable data={balance} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>提现记录</h3>
          <div className="card-actions">
            <input
              className="filter"
              placeholder="筛选资产 / 状态…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button className="refresh" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "收起" : "申请提现"}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="orderform wform">
            <label>
              资产
              <input
                list="asset-options"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="如 USDT"
              />
            </label>
            <datalist id="asset-options">
              {assetOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <label>
              提现地址
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… / 链上地址" />
            </label>
            <label>
              数量
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </label>
            <label>
              网络（可选）
              <input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="如 ERC20 / TRC20" />
            </label>
            <button className="submit" onClick={submitWithdraw} disabled={submitting}>
              {submitting ? "提交中…" : "提交提现"}
            </button>
            {formMsg && <div className={formMsg.startsWith("提现失败") ? "error" : "ok"}>{formMsg}</div>}
          </div>
        )}

        {withdrawsErr ? (
          <div className="error">加载失败：{withdrawsErr}</div>
        ) : withdraws === undefined ? (
          <div className="muted">加载中…</div>
        ) : Array.isArray(withdraws) && (withdraws as unknown[]).length === 0 ? (
          <div className="muted">暂无提现记录</div>
        ) : (
          <AdaptiveTable data={filteredWithdraws} />
        )}
      </section>
    </div>
  );
}
