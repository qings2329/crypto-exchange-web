import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type {
  RiskRule,
  RiskRuleInput,
  RiskRuleType,
  RiskAction,
  BlacklistItem,
  BlacklistInput,
  BlacklistTargetType,
  RiskEvent,
  RiskEventLevel,
} from "../api/client";
import { Modal } from "../components/Modal";
import { useConfirm } from "../components/Confirm";
import { useSelection, BatchBar, type BatchAction } from "../components/Batch";
import { TextField, TextAreaField, SelectField, CheckboxField } from "../components/Form";
import { useI18n } from "../i18n";

type Tab = "rules" | "blacklist" | "events";

const TYPE_KEY: Record<string, string> = {
  trade: "risk.type.trade",
  withdraw: "risk.type.withdraw",
  login: "risk.type.login",
  api: "risk.type.api",
};
const ACTION_KEY: Record<RiskAction, string> = {
  block: "risk.action.block",
  review: "risk.action.review",
  limit: "risk.action.limit",
};
const LEVEL_KEY: Record<RiskEventLevel, string> = {
  info: "level.info",
  warning: "level.warning",
  critical: "level.critical",
};
const STATUS_KEY: Record<RiskEvent["status"], string> = {
  open: "risk.status.open",
  resolved: "risk.status.resolved",
  ignored: "risk.status.ignored",
};

export function Risk() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("rules");
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("page.risk")}</h2>
      </div>
      <div className="tabs">
        {(
          [
            { key: "rules", label: t("risk.tab.rules") },
            { key: "blacklist", label: t("risk.tab.blacklist") },
            { key: "events", label: t("risk.tab.events") },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? "tab active" : "tab"}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "rules" && <RulesPanel />}
      {tab === "blacklist" && <BlacklistPanel />}
      {tab === "events" && <EventsPanel />}
    </div>
  );
}

function RulesPanel() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [rules, setRules] = useState<RiskRule[] | undefined>(undefined);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<RiskRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const ruleIds = useMemo(() => (rules ?? []).map((r) => r.id), [rules]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ruleIds);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setRules(undefined);
    api
      .riskRules()
      .then(setRules)
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const remove = async (r: RiskRule) => {
    if (!(await confirm({ title: t("confirm.title"), message: t("confirm.deleteItem", { name: r.name }), danger: true, confirmText: t("common.delete") })))
      return;
    await api.riskDeleteRule(r.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "delete",
      label: t("risk.batchDelete"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("confirm.title"),
          message: t("confirm.batchDelete", { n: ids.length }),
          danger: true,
          confirmText: t("common.delete"),
        });
        if (!ok) return; // 取消则保留选中
        await api.riskBatchDeleteRules(ids as number[]);
        load(); // load 会重置选中态
      },
    },
  ];
  const onRun = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("risk.rules")}</h3>
        <div className="card-actions">
          <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            {t("risk.newRule")}
          </button>
        </div>
      </div>
      <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && rules === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && rules !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>{t("risk.col.name")}</th>
                <th>{t("risk.col.type")}</th>
                <th>{t("risk.col.condition")}</th>
                <th>{t("risk.col.action")}</th>
                <th>{t("risk.col.priority")}</th>
                <th>{t("risk.col.status")}</th>
                <th>{t("risk.col.action2")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">{t("risk.emptyRules")}</td>
                </tr>
              )}
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>{r.name}</td>
                  <td>{t(TYPE_KEY[r.type])}</td>
                  <td>{r.condition}</td>
                  <td>{t(ACTION_KEY[r.action])}</td>
                  <td>{r.priority}</td>
                  <td>
                    <span className={r.enabled ? "perm-badge safe" : "perm-badge warn"}>
                      {r.enabled ? t("risk.enabled") : t("risk.disabled")}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => { setEditing(r); setShowForm(true); }}>
                      {t("common.edit")}
                    </button>
                    <button className="link-btn danger" onClick={() => remove(r)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <RuleFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </section>
  );
}

function RuleFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: RiskRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<RiskRuleType>(initial?.type ?? "trade");
  const [condition, setCondition] = useState(initial?.condition ?? "");
  const [action, setAction] = useState<RiskAction>(initial?.action ?? "block");
  const [priority, setPriority] = useState(String(initial?.priority ?? 100));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || !condition.trim()) {
      setErr(t("risk.form.err"));
      return;
    }
    const payload: RiskRuleInput = {
      name: name.trim(),
      type,
      condition: condition.trim(),
      action,
      priority: Number(priority) || 0,
      enabled,
    };
    setSaving(true);
    setErr("");
    try {
      if (initial) await api.riskUpdateRule(initial.id, payload);
      else await api.riskCreateRule(payload);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? t("risk.form.titleEdit") : t("risk.form.titleNew")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>{t("common.cancel")}</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <TextField id="r-name" label={t("risk.form.name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("risk.form.ph.name")} />
      <SelectField id="r-type" label={t("risk.form.type")} value={type} onChange={(e) => setType(e.target.value as RiskRuleType)}>
        {(Object.keys(TYPE_KEY) as RiskRuleType[]).map((k) => (
          <option key={k} value={k}>{t(TYPE_KEY[k])}</option>
        ))}
      </SelectField>
      <TextField id="r-cond" label={t("risk.form.condition")} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={t("risk.form.ph.condition")} />
      <SelectField id="r-action" label={t("risk.form.action")} value={action} onChange={(e) => setAction(e.target.value as RiskAction)}>
        {(Object.keys(ACTION_KEY) as RiskAction[]).map((k) => (
          <option key={k} value={k}>{t(ACTION_KEY[k])}</option>
        ))}
      </SelectField>
      <TextField id="r-prio" label={t("risk.form.priority")} type="number" value={priority} onChange={(e) => setPriority(e.target.value)} hint={t("risk.form.hint.priority")} />
      <CheckboxField id="r-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}>
        {t("risk.form.enabled")}
      </CheckboxField>
      {err && <div className="form-error">{err}</div>}
    </Modal>
  );
}

function BlacklistPanel() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [items, setItems] = useState<BlacklistItem[] | undefined>(undefined);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  const ids = useMemo(() => (items ?? []).map((it) => it.id), [items]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setItems(undefined);
    api
      .riskBlacklist()
      .then(setItems)
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const remove = async (it: BlacklistItem) => {
    if (!(await confirm({ title: t("confirm.title"), message: t("risk.removeBlacklist", { target: it.target }), danger: true, confirmText: t("risk.remove") })))
      return;
    await api.riskDeleteBlacklist(it.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "remove",
      label: t("risk.batchRemove"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("confirm.title"),
          message: t("risk.batchRemoveBlacklist", { n: ids.length }),
          danger: true,
          confirmText: t("risk.remove"),
        });
        if (!ok) return;
        await api.riskBatchDeleteBlacklist(ids as number[]);
        load();
      },
    },
  ];
  const onRun = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("risk.blacklist")}</h3>
        <div className="card-actions">
          <button className="btn primary" onClick={() => setShowForm(true)}>{t("risk.addBlacklist")}</button>
        </div>
      </div>
      <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && items === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && items !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>{t("risk.col.btype")}</th>
                <th>{t("risk.col.target")}</th>
                <th>{t("risk.col.reason")}</th>
                <th>{t("risk.col.expire")}</th>
                <th>{t("risk.col.action2")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">{t("risk.emptyBlacklist")}</td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  </td>
                  <td>{t(`risk.btype.${it.target_type}`)}</td>
                  <td className="mono">{it.target}</td>
                  <td>{it.reason}</td>
                  <td>{it.expire_at ? it.expire_at : t("risk.permanent")}</td>
                  <td className="row-actions">
                    <button className="link-btn danger" onClick={() => remove(it)}>{t("risk.remove")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <BlacklistFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </section>
  );
}

function BlacklistFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [targetType, setTargetType] = useState<BlacklistTargetType>("user");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [expireAt, setExpireAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!target.trim() || !reason.trim()) {
      setErr(t("risk.form.errBlacklist"));
      return;
    }
    const payload: BlacklistInput = {
      target_type: targetType,
      target: target.trim(),
      reason: reason.trim(),
      expire_at: expireAt || undefined,
    };
    setSaving(true);
    setErr("");
    try {
      await api.riskCreateBlacklist(payload);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("risk.form.blacklistTitle")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>{t("common.cancel")}</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <SelectField id="b-type" label={t("risk.form.btype")} value={targetType} onChange={(e) => setTargetType(e.target.value as BlacklistTargetType)}>
        <option value="user">{t("risk.btype.user")}</option>
        <option value="ip">{t("risk.btype.ip")}</option>
        <option value="address">{t("risk.btype.address")}</option>
      </SelectField>
      <TextField id="b-target" label={t("risk.form.target")} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t("risk.form.ph.target")} />
      <TextAreaField id="b-reason" label={t("risk.form.reason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("risk.form.ph.reason")} />
      <TextField id="b-expire" label={t("risk.form.expire")} value={expireAt} onChange={(e) => setExpireAt(e.target.value)} placeholder={t("risk.form.ph.expire")} hint={t("risk.form.hint.expire")} />
      {err && <div className="form-error">{err}</div>}
    </Modal>
  );
}

function EventsPanel() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [events, setEvents] = useState<RiskEvent[] | undefined>(undefined);
  const [err, setErr] = useState("");

  const ids = useMemo(() => (events ?? []).map((ev) => ev.id), [events]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setEvents(undefined);
    api
      .riskEvents()
      .then(setEvents)
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const act = async (ev: RiskEvent, status: "resolved" | "ignored") => {
    const label = status === "resolved" ? t("risk.markResolved") : t("risk.markIgnored");
    if (!(await confirm({ title: label, message: t(status === "resolved" ? "confirm.resolve" : "confirm.ignore", { name: `#${ev.id}（${ev.detail}）` }), confirmText: label })))
      return;
    await api.riskResolveEvent(ev.id, status);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "resolve",
      label: t("risk.batchResolved"),
      run: async (ids) => {
        const ok = await confirm({
          title: t("risk.batchResolved"),
          message: t("confirm.batchResolve", { n: ids.length }),
          confirmText: t("risk.markResolved"),
        });
        if (!ok) return;
        await api.riskBatchResolveEvents(ids as number[], "resolved");
        load();
      },
    },
    {
      key: "ignore",
      label: t("risk.batchIgnored"),
      run: async (ids) => {
        const ok = await confirm({
          title: t("risk.batchIgnored"),
          message: t("confirm.batchIgnore", { n: ids.length }),
          confirmText: t("risk.markIgnored"),
        });
        if (!ok) return;
        await api.riskBatchResolveEvents(ids as number[], "ignored");
        load();
      },
    },
  ];
  const onRun = async (a: BatchAction) => {
    setBusy(true);
    try {
      await a.run([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("risk.events")}</h3>
        <div className="card-actions">
          <button className="btn" onClick={load}>{t("common.refresh")}</button>
        </div>
      </div>
      <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
      {err && <div className="error">{t("common.loadError", { err })}</div>}
      {!err && events === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && events !== undefined && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>{t("risk.col.level")}</th>
                <th>{t("risk.col.type")}</th>
                <th>{t("risk.col.target")}</th>
                <th>{t("risk.col.detail")}</th>
                <th>{t("risk.col.status")}</th>
                <th>{t("risk.col.action2")}</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">{t("risk.emptyEvents")}</td>
                </tr>
              )}
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggle(ev.id)} />
                  </td>
                  <td>
                    <span className={`perm-badge ${ev.level === "critical" ? "danger" : ev.level === "warning" ? "warn" : "safe"}`}>
                      {t(LEVEL_KEY[ev.level])}
                    </span>
                  </td>
                  <td>{t(TYPE_KEY[ev.type])}</td>
                  <td className="mono">{ev.target}</td>
                  <td>{ev.detail}</td>
                  <td>{t(STATUS_KEY[ev.status])}</td>
                  <td className="row-actions">
                    {ev.status === "open" ? (
                      <>
                        <button className="link-btn" onClick={() => act(ev, "resolved")}>{t("risk.markResolved")}</button>
                        <button className="link-btn" onClick={() => act(ev, "ignored")}>{t("risk.markIgnored")}</button>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
