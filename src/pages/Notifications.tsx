import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type {
  NotificationItem,
  NotificationInput,
  NotificationLevel,
  NotificationTarget,
} from "../api/client";
import { Modal } from "../components/Modal";
import { useConfirm } from "../components/Confirm";
import { useSelection, BatchBar, type BatchAction } from "../components/Batch";
import { TextField, TextAreaField, SelectField } from "../components/Form";
import { useI18n } from "../i18n";

const LEVEL_KEY: Record<NotificationLevel, string> = {
  info: "level.info",
  warning: "level.warning",
  critical: "level.critical",
};
const TARGET_KEY: Record<NotificationTarget, string> = {
  all: "notif.target.all",
  vip: "notif.target.vip",
  user: "notif.target.user",
};
const STATUS_KEY: Record<NotificationItem["status"], string> = {
  sent: "notif.status.sent",
  recalled: "notif.status.recalled",
};

export function Notifications() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [list, setList] = useState<NotificationItem[] | undefined>(undefined);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  const ids = useMemo(() => (list ?? []).map((n) => n.id), [list]);
  const { selected, toggle, toggleAll, allSelected, clear } = useSelection<number>(ids);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setList(undefined);
    api
      .notifications()
      .then(setList)
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, []);

  const recall = async (n: NotificationItem) => {
    if (n.status === "recalled") return;
    if (!(await confirm({ title: t("confirm.title"), message: t("confirm.recallItem", { name: n.title }), confirmText: t("notif.recall") })))
      return;
    await api.notificationRecall(n.id);
    load();
  };

  const remove = async (n: NotificationItem) => {
    if (!(await confirm({ title: t("confirm.title"), message: t("confirm.deleteItem", { name: n.title }), danger: true, confirmText: t("common.delete") })))
      return;
    await api.notificationDelete(n.id);
    load();
  };

  const batchActions: BatchAction[] = [
    {
      key: "delete",
      label: t("notif.batchDelete"),
      danger: true,
      run: async (ids) => {
        const ok = await confirm({
          title: t("confirm.title"),
          message: t("confirm.batchDelete", { n: ids.length }),
          danger: true,
          confirmText: t("common.delete"),
        });
        if (!ok) return;
        await api.notificationBatchDelete(ids as number[]);
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
    <div className="page">
      <h2>{t("page.notifications")}</h2>
      <section className="card">
        <div className="panel-head">
          <h3>{t("notif.all")}</h3>
          <button className="btn primary" onClick={() => setShowForm(true)}>{t("notif.publish")}</button>
        </div>
        <BatchBar ids={[...selected]} actions={batchActions} onClear={clear} busy={busy} onRun={onRun} />
        {err && <div className="error">{t("common.loadError", { err })}</div>}
        {!err && list === undefined && <div className="muted">{t("common.loading")}</div>}
        {!err && list !== undefined && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th>{t("notif.col.title")}</th>
                  <th>{t("notif.col.level")}</th>
                  <th>{t("notif.col.scope")}</th>
                  <th>{t("notif.col.content")}</th>
                  <th>{t("notif.col.status")}</th>
                  <th>{t("notif.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">{t("notif.empty")}</td>
                  </tr>
                )}
                {list.map((n) => (
                  <tr key={n.id}>
                    <td className="col-check">
                      <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
                    </td>
                    <td>{n.title}</td>
                    <td>
                      <span className={`perm-badge ${n.level === "critical" ? "danger" : n.level === "warning" ? "warn" : "safe"}`}>
                        {t(LEVEL_KEY[n.level])}
                      </span>
                    </td>
                    <td>{t(TARGET_KEY[n.target])}{n.target_user ? ` (${n.target_user})` : ""}</td>
                    <td className="cell-clamp">{n.content}</td>
                    <td>{t(STATUS_KEY[n.status])}</td>
                    <td className="row-actions">
                      <button className="link-btn" disabled={n.status === "recalled"} onClick={() => recall(n)}>{t("notif.recall")}</button>
                      <button className="link-btn danger" onClick={() => remove(n)}>{t("common.delete")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showForm && (
        <NotificationFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function NotificationFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [level, setLevel] = useState<NotificationLevel>("info");
  const [target, setTarget] = useState<NotificationTarget>("all");
  const [targetUser, setTargetUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      setErr(t("notif.err.fill"));
      return;
    }
    const payload: NotificationInput = {
      title: title.trim(),
      content: content.trim(),
      level,
      target,
      target_user: target === "user" ? targetUser.trim() || undefined : undefined,
    };
    setSaving(true);
    setErr("");
    try {
      await api.notificationCreate(payload);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("notif.form.title")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>{t("common.cancel")}</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? t("notif.publishing") : t("common.submit")}
          </button>
        </>
      }
    >
      <TextField id="n-title" label={t("notif.form.titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("notif.ph.title")} />
      <TextAreaField id="n-content" label={t("notif.form.contentLabel")} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("notif.ph.content")} />
      <SelectField id="n-level" label={t("notif.form.levelLabel")} value={level} onChange={(e) => setLevel(e.target.value as NotificationLevel)}>
        {(Object.keys(LEVEL_KEY) as NotificationLevel[]).map((k) => (
          <option key={k} value={k}>{t(LEVEL_KEY[k])}</option>
        ))}
      </SelectField>
      <SelectField id="n-target" label={t("notif.form.scopeLabel")} value={target} onChange={(e) => setTarget(e.target.value as NotificationTarget)}>
        {(Object.keys(TARGET_KEY) as NotificationTarget[]).map((k) => (
          <option key={k} value={k}>{t(TARGET_KEY[k])}</option>
        ))}
      </SelectField>
      {target === "user" && (
        <TextField id="n-user" label={t("notif.form.targetUserLabel")} value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder={t("notif.ph.targetUser")} />
      )}
      {err && <div className="form-error">{err}</div>}
    </Modal>
  );
}
