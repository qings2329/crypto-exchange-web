import { useEffect, useState } from "react";
import { api, type ApiKey, type ApiKeyPermission } from "../api/client";
import { useI18n } from "../i18n";
import { formatDateTime } from "../lib/timezone";

const PERMS: ApiKeyPermission[] = ["read", "trade", "withdraw"];
// 权限 -> 文案 key（对齐 apikeys.perm.*）。
const PERM_KEY: Record<ApiKeyPermission, string> = {
  read: "apikeys.perm.read",
  trade: "apikeys.perm.trade",
  withdraw: "apikeys.perm.withdraw",
};
// 提现权限风险最高，单独高亮。
const PERM_RISK: Record<ApiKeyPermission, string> = {
  read: "safe",
  trade: "warn",
  withdraw: "danger",
};

interface CreateState {
  label: string;
  permissions: ApiKeyPermission[];
  ipText: string; // 逗号/换行分隔，提交时解析为数组
}

const EMPTY: CreateState = { label: "", permissions: ["read"], ipText: "" };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// 把文本框解析为 IP 白名单数组（去空、去重、去空格）。
function parseIps(text: string): string[] {
  const set = new Set<string>();
  for (const part of text.split(/[\n,]/)) {
    const v = part.trim();
    if (v) set.add(v);
  }
  return [...set];
}

export function ApiKeys() {
  const { t } = useI18n();
  const [list, setList] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // 分页
  const [page, setPage] = useState(1); // 1-based
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // 筛选
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [permFilter, setPermFilter] = useState("");
  const hasFilter = !!(q || statusFilter || permFilter);

  // 创建表单
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateState>(EMPTY);
  const [creating, setCreating] = useState(false);

  // 创建后一次性展示的 secret（关闭后不可再获取）。
  const [created, setCreated] = useState<{ key: string; secret: string } | null>(null);

  // 加载某一页（默认当前 page）。filters 缺省时取当前筛选状态。返回 {api_keys, total}。
  async function load(
    targetPage = page,
    filters?: { q: string; status: string; permission: string }
  ): Promise<{ api_keys: ApiKey[]; total: number }> {
    const f = filters ?? { q, status: statusFilter, permission: permFilter };
    setLoading(true);
    setErr("");
    try {
      const r = await api.apiKeys({
        limit: pageSize,
        offset: (targetPage - 1) * pageSize,
        q: f.q,
        status: f.status,
        permission: f.permission,
      });
      setList(r.api_keys);
      setTotal(r.total);
      return r;
    } catch (e) {
      setErr((e as Error).message);
      return { api_keys: [], total: 0 };
    } finally {
      setLoading(false);
    }
  }

  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  function goto(p: number) {
    const np = Math.min(Math.max(1, p), maxPage);
    setPage(np);
    load(np);
  }
  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
    load(1);
  }

  // 筛选变化：重置到第 1 页并带最新筛选条件重新加载（显式传参避免闭包陈旧）。
  function onSearch(v: string) {
    setQ(v);
    load(1, { q: v, status: statusFilter, permission: permFilter });
  }
  function onStatusFilter(v: string) {
    setStatusFilter(v);
    load(1, { q, status: v, permission: permFilter });
  }
  function onPermFilter(v: string) {
    setPermFilter(v);
    load(1, { q, status: statusFilter, permission: v });
  }
  function resetFilters() {
    setQ("");
    setStatusFilter("");
    setPermFilter("");
    load(1, { q: "", status: "", permission: "" });
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm(EMPTY);
    setFormOpen(true);
    setErr("");
    setMsg("");
  }

  function togglePerm(p: ApiKeyPermission) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));
  }

  async function create() {
    if (!form.label.trim()) {
      setErr(t("apikeys.needLabel"));
      return;
    }
    if (form.permissions.length === 0) {
      setErr(t("apikeys.needPerm"));
      return;
    }
    setCreating(true);
    setErr("");
    try {
      const r = await api.apiKeyCreate({
        label: form.label.trim(),
        permissions: form.permissions,
        ip_whitelist: parseIps(form.ipText),
      });
      setCreated({ key: r.api_key.key, secret: r.secret });
      setFormOpen(false);
      setForm(EMPTY);
      setMsg(t("apikeys.created"));
      // 密钥按插入顺序排在末尾，创建后跳到最后一页以展示新密钥。
      const r2 = await load();
      const lastPage = Math.max(1, Math.ceil(r2.total / pageSize));
      if (lastPage !== page) {
        setPage(lastPage);
        await load(lastPage);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(k: ApiKey) {
    const next = k.status === "active" ? "disabled" : "active";
    setErr("");
    try {
      await api.apiKeyUpdate(k.id, { status: next });
      setMsg(next === "disabled" ? t("apikeys.disabledMsg", { label: k.label }) : t("apikeys.enabledMsg", { label: k.label }));
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(k: ApiKey) {
    if (!confirm(t("apikeys.confirmRevoke", { label: k.label }))) return;
    setErr("");
    try {
      await api.apiKeyDelete(k.id);
      setMsg(t("apikeys.revokedMsg", { label: k.label }));
      // 若删空当前页且不在首页，回退到上一页。
      if (list.length <= 1 && page > 1) goto(page - 1);
      else await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("apikeys.title")}</h2>
        <div>
          <button className="btn" disabled={loading} onClick={() => load()}>
            {t("common.refresh")}
          </button>
          <button className="link-btn" onClick={startCreate}>
            {t("apikeys.new")}
          </button>
        </div>
      </div>

      {/* 一次性 secret 展示：强调仅出现一次 */}
      {created && (
        <section className="card secret-box">
          <div className="card-head">
            <h3>{t("apikeys.createdTitle")}</h3>
          </div>
          <div className="ok">
            {t("apikeys.saveHint")}
          </div>
          <label>
            {t("apikeys.keyPublic")}
            <div className="copy-row">
              <input className="mono" value={created.key} readOnly />
              <button
                className="copy-btn"
                onClick={async () => setMsg((await copy(created.key)) ? t("apikeys.copied") : t("apikeys.copyFail"))}
              >
                {t("apikeys.copy")}
              </button>
            </div>
          </label>
          <label>
            {t("apikeys.secret")}
            <div className="copy-row">
              <input className="mono" type="text" value={created.secret} readOnly />
              <button
                className="copy-btn"
                onClick={async () => setMsg((await copy(created.secret)) ? t("apikeys.copied") : t("apikeys.copyFail"))}
              >
                {t("apikeys.copy")}
              </button>
            </div>
          </label>
          <div>
            <button className="btn primary" onClick={() => setCreated(null)}>
              {t("apikeys.closeSaved")}
            </button>
          </div>
        </section>
      )}

      {err && <div className="error">{t("apikeys.fail", { err })}</div>}
      {msg && <div className="ok">{msg}</div>}

      {/* 创建表单 */}
      {formOpen && (
        <section className="card">
          <div className="card-head">
            <h3>{t("apikeys.createTitle")}</h3>
          </div>
          <label>
            {t("apikeys.label")}
            <input
              value={form.label}
              maxLength={64}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t("apikeys.labelPh")}
            />
          </label>
          <div className="perm-group">
            <div className="perm-title">{t("apikeys.permTitle")}</div>
            {PERMS.map((p) => (
              <label key={p} className="perm-check">
                <input
                  type="checkbox"
                  checked={form.permissions.includes(p)}
                  onChange={() => togglePerm(p)}
                />
                <span className={`perm-badge ${PERM_RISK[p]}`}>{t(PERM_KEY[p])}</span>
                {p === "withdraw" && <span className="muted">{t("apikeys.highRisk")}</span>}
              </label>
            ))}
          </div>
          <label>
            {t("apikeys.ipWhitelist")}
            <textarea
              value={form.ipText}
              maxLength={1024}
              onChange={(e) => setForm({ ...form, ipText: e.target.value })}
              placeholder={t("apikeys.ipWhitelistPh")}
              style={{ minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
            />
          </label>
          <div>
            <button className="btn primary" disabled={creating} onClick={create}>
              {creating ? t("apikeys.creating") : t("apikeys.create")}
            </button>
            <button className="btn" onClick={() => { setForm(EMPTY); setFormOpen(false); }}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {/* 列表 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("apikeys.myKeys")}</h3>
        </div>
        <div className="filter-bar">
          <input
            className="filter"
            placeholder={t("apikeys.searchPh")}
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
          <select className="filter" value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)}>
            <option value="">{t("apikeys.allStatus")}</option>
            <option value="active">{t("apikeys.statusActive")}</option>
            <option value="disabled">{t("apikeys.statusDisabled")}</option>
          </select>
          <select className="filter" value={permFilter} onChange={(e) => onPermFilter(e.target.value)}>
            <option value="">{t("apikeys.allPerm")}</option>
            <option value="read">{t("apikeys.perm.read")}</option>
            <option value="trade">{t("apikeys.perm.trade")}</option>
            <option value="withdraw">{t("apikeys.perm.withdraw")}</option>
          </select>
          {hasFilter && (
            <button className="link-btn" onClick={resetFilters}>
              {t("apikeys.reset")}
            </button>
          )}
        </div>
        {loading && list.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && list.length === 0 && (
          <div className="muted">
            {hasFilter ? t("apikeys.noMatch") : t("apikeys.noKeys")}
          </div>
        )}
        {list.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("apikeys.col.id")}</th>
                  <th>{t("apikeys.col.label")}</th>
                  <th>{t("apikeys.col.key")}</th>
                  <th>{t("apikeys.col.perms")}</th>
                  <th>{t("apikeys.col.ip")}</th>
                  <th>{t("apikeys.col.status")}</th>
                  <th>{t("apikeys.col.createdAt")}</th>
                  <th>{t("apikeys.col.lastUsed")}</th>
                  <th>{t("apikeys.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((k) => (
                  <tr key={k.id}>
                    <td>{k.id}</td>
                    <td>{k.label}</td>
                    <td className="mono">{k.key}</td>
                    <td>
                      <div className="perm-list">
                        {k.permissions.map((p) => (
                          <span key={p} className={`perm-badge ${PERM_RISK[p]}`}>
                            {t(PERM_KEY[p])}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="muted">
                      {k.ip_whitelist && k.ip_whitelist.length > 0
                        ? k.ip_whitelist.join("、")
                        : t("apikeys.ipNone")}
                    </td>
                    <td>
                      <span className={`ostatus ${k.status === "active" ? "completed" : "cancelled"}`}>
                        {k.status === "active" ? t("apikeys.statusActive") : t("apikeys.statusDisabled")}
                      </span>
                    </td>
                    <td className="muted">
                      {k.created_at ? formatDateTime(k.created_at) : "-"}
                    </td>
                    <td className="muted">
                      {k.last_used_at ? formatDateTime(k.last_used_at) : t("apikeys.never")}
                    </td>
                    <td>
                      <div>
                        <button className="link-btn" onClick={() => toggleStatus(k)}>
                          {k.status === "active" ? t("apikeys.disable") : t("apikeys.enable")}
                        </button>
                        <button className="link-btn" onClick={() => remove(k)}>
                          {t("apikeys.revoke")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="pager">
            <button disabled={page <= 1 || loading} onClick={() => goto(page - 1)}>
              {t("common.prev")}
            </button>
            <span>
              {t("apikeys.pageInfo", { page, maxPage })}
            </span>
            <button disabled={page >= maxPage || loading} onClick={() => goto(page + 1)}>
              {t("common.next")}
            </button>
            <span>{t("apikeys.totalCount", { count: total })}</span>
            <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {t("otc.perPage", { n })}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>
    </div>
  );
}
