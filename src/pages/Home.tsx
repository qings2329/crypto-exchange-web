import { useEffect, useState } from "react";
import {
  api,
  type Announcement,
  type AnnouncementLevel,
  type UserProfile,
} from "../api/client";
import { useI18n } from "../i18n";

// 公告等级 -> 文案 key
const LEVEL_KEY: Record<AnnouncementLevel, string> = {
  info: "ann.level.info",
  warning: "ann.level.warning",
  maintenance: "ann.level.maintenance",
};

// KYC 等级 -> 文案 key
const KYC_KEY = ["home.kyc.unverified", "home.kyc.reviewing", "home.kyc.verified", "home.kyc.rejected"];

// 快捷入口：nav.* 为入口名，home.sc.* 为描述。
const SC_NAV: Record<string, string> = {
  "/trade": "trade",
  "/otc": "otc",
  "/wallet": "wallet",
  "/futures": "futures",
  "/options": "options",
  "/wealth": "wealth",
  "/margin": "margin",
  "/settings": "settings",
};
const SHORTCUT_PATHS = [
  "/trade",
  "/otc",
  "/wallet",
  "/futures",
  "/options",
  "/wealth",
  "/margin",
  "/settings",
];

export function Home() {
  const { t } = useI18n();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([api.userMe().catch(() => null), api.listAnnouncements().catch(() => [])])
      .then(([m, anns]) => {
        if (!alive) return;
        setMe(m);
        setAnnouncements((anns as Announcement[]) ?? []);
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  const name = me?.nickname || me?.email || (me?.phone ? me.phone : t("nav.user", { uid: me?.user_id ?? "" }));

  return (
    <div className="page home">
      <div className="home-hero">
        <h2>{t("home.welcome", { name })}</h2>
        <p className="muted">{t("home.subtitle")}</p>
      </div>

      {err && <div className="error">{t("common.loadError", { err })}</div>}

      {/* 公告横幅 */}
      <section className="card ann-banner">
        <div className="card-head">
          <h3>{t("home.annBanner")}</h3>
          <a className="link-btn" href="#/announcements">
            {t("home.viewAll")}
          </a>
        </div>
        {announcements.length === 0 ? (
          <div className="muted">{t("home.noAnn")}</div>
        ) : (
          <ul className="ann-list">
            {announcements.map((a) => (
              <li key={a.id} className="ann">
                <span className={`ann-badge ${a.level}`}>{t(LEVEL_KEY[a.level])}</span>
                <span className="ann-title">{a.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 模块快捷入口 */}
      <section className="card">
        <h3>{t("home.shortcuts")}</h3>
        <div className="shortcut-grid">
          {SHORTCUT_PATHS.map((path) => (
            <a key={path} className="shortcut" href={`#${path}`}>
              <span className="shortcut-label">{t(`nav.${SC_NAV[path]}`)}</span>
              <span className="shortcut-desc">{t(`home.sc.${SC_NAV[path]}`)}</span>
            </a>
          ))}
        </div>
      </section>

      {/* 账户概览 */}
      <section className="card">
        <h3>{t("home.accountOverview")}</h3>
        {me ? (
          <div className="kv">
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.userId")}</span>
              <span className="kv-v">{me.user_id}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.account")}</span>
              <span className="kv-v">{me.email || me.phone || "-"}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.kyc")}</span>
              <span className="kv-v">{t(KYC_KEY[me.kyc_level] ?? "home.kyc.unverified")}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.tfa")}</span>
              <span className="kv-v">{me.tfa_enabled ? t("home.tfaOn") : t("home.tfaOff")}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.email")}</span>
              <span className="kv-v">{me.email_verified ? t("home.emailVerified") : t("home.emailUnverified")}</span>
            </div>
            <div className="kv-row">
              <span className="kv-k">{t("home.kv.status")}</span>
              <span className="kv-v">{me.status === 0 ? t("home.statusNormal") : t("home.statusFrozen")}</span>
            </div>
          </div>
        ) : (
          <div className="muted">{t("common.loading")}</div>
        )}
        <div style={{ marginTop: 12 }}>
          <a className="link-btn" href="#/settings">
            {t("home.goSettings")}
          </a>
        </div>
      </section>
    </div>
  );
}
