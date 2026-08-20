import { useEffect, useState } from "react";
import {
  api,
  type Announcement,
  type AnnouncementLevel,
  type UserProfile,
} from "../api/client";
import { useI18n } from "../i18n";
const LEVEL_KEY: Record<AnnouncementLevel, string> = {
  info: "ann.level.info",
  warning: "ann.level.warning",
  maintenance: "ann.level.maintenance",
};

const KYC_KEY = ["home.kyc.unverified", "home.kyc.reviewing", "home.kyc.verified", "home.kyc.rejected"];

// 模拟市场数据（生产环境从 WebSocket/API 获取）
const MARKET_DATA = [
  { symbol: "BTC/USDT", pair: "BTC_USDT", price: "67,234.50", change: "+2.34", icon: "BTC" },
  { symbol: "ETH/USDT", pair: "ETH_USDT", price: "3,456.78", change: "+1.87", icon: "ETH" },
  { symbol: "BNB/USDT", pair: "BNB_USDT", price: "598.23", change: "-0.45", icon: "BNB" },
  { symbol: "SOL/USDT", pair: "SOL_USDT", price: "178.90", change: "+5.12", icon: "SOL" },
  { symbol: "XRP/USDT", pair: "XRP_USDT", price: "0.6234", change: "+0.89", icon: "XRP" },
  { symbol: "DOGE/USDT", pair: "DOGE_USDT", price: "0.1567", change: "-1.23", icon: "DOGE" },
];

// 快捷入口配置
const SHORTCUTS = [
  { path: "/trade", icon: "📊", key: "trade" },
  { path: "/wallet", icon: "💰", key: "wallet" },
  { path: "/futures", icon: "📈", key: "futures" },
  { path: "/lending", icon: "🏦", key: "lending" },
  { path: "/wealth", icon: "💎", key: "wealth" },
  { path: "/bot", icon: "🤖", key: "bot" },
  { path: "/referral", icon: "🎁", key: "referral" },
  { path: "/settings", icon: "⚙️", key: "settings" },
];

export function Home() {
  const { t } = useI18n();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.userMe().catch(() => null), api.listAnnouncements().catch(() => [])])
      .then(([m, anns]) => {
        if (!alive) return;
        setMe(m);
        setAnnouncements((anns as Announcement[]) ?? []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="page">
      {/* Hero 横幅 */}
      <div className="home-hero">
        <h2>{t("home.heroTitle")}</h2>
        <p className="hero-sub">{t("home.heroSub")}</p>
        <div className="hero-actions">
          <a href="#/register" className="btn-primary">
            {t("home.heroCta")}
          </a>
          <a href="#/trade" className="btn-outline">
            {t("home.heroTrade")}
          </a>
        </div>
      </div>

      {/* 市场概览 */}
      <div className="bn-card">
        <div className="bn-card-header">
          <h3>{t("home.marketOverview")}</h3>
          <a href="#/trade" className="link">{t("home.viewAll")}</a>
        </div>
        <table className="market-table">
          <thead>
            <tr>
              <th>{t("home.mktPair")}</th>
              <th style={{ textAlign: "right" }}>{t("home.mktPrice")}</th>
              <th style={{ textAlign: "right" }}>{t("home.mktChange")}</th>
              <th style={{ textAlign: "right" }}>{t("home.mktAction")}</th>
            </tr>
          </thead>
          <tbody>
            {MARKET_DATA.map((m) => {
              const isUp = m.change.startsWith("+");
              return (
                <tr key={m.pair}>
                  <td>
                    <div className="coin-name">
                      <span className="coin-icon">{m.icon}</span>
                      {m.symbol}
                    </div>
                  </td>
                  <td className="price" style={{ textAlign: "right" }}>{m.price}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={isUp ? "change-up" : "change-down"}>{m.change}%</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <a href={`#/trade?symbol=${m.pair}`} className="trade-btn">
                      {t("home.mktTrade")}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 快捷入口 */}
      <div className="bn-card">
        <div className="bn-card-header">
          <h3>{t("home.shortcuts")}</h3>
        </div>
        <div className="bn-shortcuts">
          {SHORTCUTS.map((sc) => (
            <a key={sc.path} className="bn-shortcut" href={`#${sc.path}`}>
              <span className="bn-shortcut-icon">{sc.icon}</span>
              <span className="bn-shortcut-label">{t(`nav.${sc.key}`)}</span>
            </a>
          ))}
        </div>
      </div>

      {/* 公告 */}
      {announcements.length > 0 && (
        <div className="bn-card">
          <div className="bn-card-header">
            <h3>{t("home.annBanner")}</h3>
            <a href="#/announcements" className="link">{t("home.viewAll")}</a>
          </div>
          <ul className="bn-ann-list">
            {announcements.slice(0, 5).map((a) => (
              <li key={a.id} className="bn-ann-item">
                <span className={`bn-ann-badge ${a.level}`}>{t(LEVEL_KEY[a.level])}</span>
                <span className="bn-ann-title">{a.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 账户概览（仅登录用户） */}
      {me && (
        <div className="bn-card">
          <div className="bn-card-header">
            <h3>{t("home.accountOverview")}</h3>
            <a href="#/settings" className="link">{t("home.goSettings")}</a>
          </div>
          <div className="account-grid">
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.userId")}</div>
              <div className="stat-value">#{me.user_id}</div>
            </div>
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.account")}</div>
              <div className="stat-value">{me.email || me.phone || "-"}</div>
            </div>
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.kyc")}</div>
              <div className={`stat-value ${me.kyc_level === 2 ? "stat-ok" : ""}`}>
                {t(KYC_KEY[me.kyc_level] ?? "home.kyc.unverified")}
              </div>
            </div>
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.tfa")}</div>
              <div className={`stat-value ${me.tfa_enabled ? "stat-ok" : "stat-warn"}`}>
                {me.tfa_enabled ? t("home.tfaOn") : t("home.tfaOff")}
              </div>
            </div>
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.email")}</div>
              <div className={`stat-value ${me.email_verified ? "stat-ok" : "stat-warn"}`}>
                {me.email_verified ? t("home.emailVerified") : t("home.emailUnverified")}
              </div>
            </div>
            <div className="account-stat">
              <div className="stat-label">{t("home.kv.status")}</div>
              <div className={`stat-value ${me.status === 0 ? "stat-ok" : "stat-bad"}`}>
                {me.status === 0 ? t("home.statusNormal") : t("home.statusFrozen")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
