import { useEffect, useState } from "react";
import { api, type Announcement } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";

const LEVEL_KEY: Record<string, string> = {
  info: "ann.level.info",
  warning: "ann.level.warning",
  maintenance: "ann.level.maintenance",
};

function fmt(ts: number | string, locale: string) {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(locale.startsWith("zh") ? "zh-CN" : locale, { hour12: false });
}

/** 用户端公告列表（公开页）：只读，按时间倒序；管理端增删改在 ce-admin-web。 */
export default function Announcements() {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Announcement[] | undefined>(undefined);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .listAnnouncements()
      .then(setList)
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("page.announcements")}</h2>
      </div>
      <InlineError err={err} />
      {!err && list === undefined && <div className="muted">{t("common.loading")}</div>}
      {!err && list !== undefined && list.length === 0 && (
        <div className="muted">{t("ann.empty")}</div>
      )}
      {list !== undefined && list.length > 0 && (
        <ul className="ann-list">
          {list.map((a) => (
            <li key={a.id} className="card ann-item">
              <div className="flex items-center gap-2">
                <span className={`bn-ann-badge ${a.level}`}>{t(LEVEL_KEY[a.level] ?? LEVEL_KEY.info)}</span>
                <span className="font-semibold">{a.title}</span>
              </div>
              {a.content && <p className="mt-2 text-sm text-muted whitespace-pre-wrap">{a.content}</p>}
              <div className="mt-2 text-xs text-muted">{fmt(a.published_at ?? a.created_at ?? "", locale)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
