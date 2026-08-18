import { useEffect, useState } from "react";
import {
  api,
  type Announcement,
  type AnnouncementInput,
  type AnnouncementLevel,
} from "../api/client";
import { useI18n } from "../i18n";

const LEVELS: AnnouncementLevel[] = ["info", "warning", "maintenance"];
// 公告等级 -> 文案 key（对齐 ann.level.*）。
const LEVEL_KEY: Record<AnnouncementLevel, string> = {
  info: "ann.level.info",
  warning: "ann.level.warning",
  maintenance: "ann.level.maintenance",
};

interface FormState {
  id: number | null; // null 表示新建
  level: AnnouncementLevel;
  title: string;
  content: string;
  active: boolean;
}

const EMPTY: FormState = { id: null, level: "info", title: "", content: "", active: true };

export function Announcements() {
  const { t } = useI18n();
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setList(await api.adminListAnnouncements());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // 无管理权限时接口会返回 403，加载即失败，由 err 展示。
  }, []);

  function startCreate() {
    setEditing(EMPTY);
    setFormOpen(true);
    setMsg("");
    setErr("");
  }

  function startEdit(a: Announcement) {
    setEditing({ id: a.id, level: a.level, title: a.title, content: a.content, active: a.active });
    setFormOpen(true);
    setMsg("");
    setErr("");
  }

  async function save() {
    if (!editing.title.trim()) {
      setErr(t("ann.errTitle"));
      return;
    }
    setErr("");
    const payload: AnnouncementInput = {
      level: editing.level,
      title: editing.title.trim(),
      content: editing.content,
      active: editing.active,
    };
    try {
      if (editing.id == null) {
        await api.adminCreateAnnouncement(payload);
        setMsg(t("ann.created"));
      } else {
        await api.adminUpdateAnnouncement(editing.id, payload);
        setMsg(t("ann.updated"));
      }
      setEditing(EMPTY);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(a: Announcement) {
    if (!confirm(t("ann.confirmDelete", { name: a.title }))) return;
    setErr("");
    try {
      await api.adminDeleteAnnouncement(a.id);
      setMsg(t("ann.deleted"));
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("ann.title")}</h2>
        <div className="card-actions">
          <button className="refresh" disabled={loading} onClick={load}>
            {t("common.refresh")}
          </button>
          <button className="link-btn" onClick={startCreate}>
            {t("ann.new")}
          </button>
        </div>
      </div>

      {err && <div className="error">{t("ann.fail", { err })}</div>}
      {msg && <div className="ok">{msg}</div>}

      {/* 编辑/新建表单 */}
      {formOpen && (
        <section className="card wform">
          <h3>{editing.id == null ? t("ann.formNew") : t("ann.formEdit", { id: editing.id })}</h3>
          <label>
            {t("ann.level")}
            <select
              value={editing.level}
              onChange={(e) => setEditing({ ...editing, level: e.target.value as AnnouncementLevel })}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(LEVEL_KEY[l])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("ann.titleLabel")}
            <input
              value={editing.title}
              maxLength={128}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder={t("ann.ph.title")}
            />
          </label>
          <label>
            {t("ann.content")}
            <textarea
              value={editing.content}
              maxLength={4096}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              placeholder={t("ann.contentPh")}
              style={{ minHeight: 80, resize: "vertical" }}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
            />
            {t("ann.publish")}
          </label>
          <div className="row-actions">
            <button className="submit" onClick={save}>
              {t("common.save")}
            </button>
            <button className="refresh" onClick={() => { setEditing(EMPTY); setFormOpen(false); }}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {/* 列表 */}
      <section className="card">
        <h3>{t("ann.allDrafts")}</h3>
        {loading && list.length === 0 && <div className="muted">{t("common.loading")}</div>}
        {!loading && list.length === 0 && <div className="muted">{t("ann.noAnn")}</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("ann.col.id")}</th>
                <th>{t("ann.col.level")}</th>
                <th>{t("ann.col.title")}</th>
                <th>{t("ann.col.status")}</th>
                <th>{t("ann.col.publishedAt")}</th>
                <th>{t("ann.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>
                    <span className={`ann-badge ${a.level}`}>
                      {t(LEVEL_KEY[a.level])}
                    </span>
                  </td>
                  <td>{a.title}</td>
                  <td>{a.active ? t("ann.statusPublished") : t("ann.statusDraft")}</td>
                  <td className="muted">{a.published_at ? a.published_at.replace("T", " ").slice(0, 19) : "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="link-btn" onClick={() => startEdit(a)}>
                        {t("common.edit")}
                      </button>
                      <button className="link-btn" onClick={() => remove(a)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
