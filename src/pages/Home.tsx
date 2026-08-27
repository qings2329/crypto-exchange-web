import { useEffect, useState } from "react";
import {
  api,
  type Announcement,
  type AnnouncementLevel,
  type UserProfile,
} from "../api/client";
import { useI18n } from "../i18n";
import { useTickerLive } from "../hooks/use-ticker-live";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";
const LEVEL_KEY: Record<AnnouncementLevel, string> = {
  info: "ann.level.info",
  warning: "ann.level.warning",
  maintenance: "ann.level.maintenance",
};

const KYC_KEY = ["home.kyc.unverified", "home.kyc.reviewing", "home.kyc.verified", "home.kyc.rejected"];

// 首页热门交易对：实时行情经 binance-ws 多路复用器订阅（单连接承载全部 @ticker 流）
const HOT_PAIRS = [
  { symbol: "BTCUSDT", icon: "BTC", label: "BTC/USDT" },
  { symbol: "ETHUSDT", icon: "ETH", label: "ETH/USDT" },
  { symbol: "BNBUSDT", icon: "BNB", label: "BNB/USDT" },
  { symbol: "SOLUSDT", icon: "SOL", label: "SOL/USDT" },
  { symbol: "XRPUSDT", icon: "XRP", label: "XRP/USDT" },
  { symbol: "DOGEUSDT", icon: "DOGE", label: "DOGE/USDT" },
] as const;

// 单行行情：REST 种子 + WS 增量，涨跌红绿即时刷新
function MarketRow({ symbol, icon, label }: { symbol: string; icon: string; label: string }) {
  const { t } = useI18n();
  const { ticker } = useTickerLive(symbol);
  const up = (ticker?.priceChangePercent ?? 0) >= 0;
  return (
    <tr>
      <td>
        <div className="coin-name">
          <span className="coin-icon">{icon}</span>
          {label}
        </div>
      </td>
      <td className="price mono text-right">
        {ticker ? fmtPrice(ticker.lastPrice) : "--"}
      </td>
      <td className="mono text-right">
        {ticker ? fmtQty(ticker.quoteVolume) : "--"}
      </td>
      <td className="text-right">
        <span className={`mono ${up ? "change-up" : "change-down"}`}>
          {ticker ? fmtPercent(ticker.priceChangePercent) : "--"}
        </span>
      </td>
      <td className="text-right">
        <a href={`#/trade/${symbol}`} className="trade-btn">
          {t("home.mktTrade")}
        </a>
      </td>
    </tr>
  );
}

// 快捷入口配置
const SHORTCUTS = [
  { path: "/trade", icon: "📊", key: "trade" },
  { path: "/wallet", icon: "💰", key: "wallet" },
  { path: "/futures", icon: "📈", key: "futures" },
  { path: "/lending", icon: "🏦", key: "lending" },
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
          {!me && (
            <a href="#/register" className="btn-primary">
              {t("home.heroCta")}
            </a>
          )}
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
              <th className="text-right">{t("home.mktPrice")}</th>
              <th className="text-right">24h Vol(USDT)</th>
              <th className="text-right">{t("home.mktChange")}</th>
              <th className="text-right">{t("home.mktAction")}</th>
            </tr>
          </thead>
          <tbody>
            {HOT_PAIRS.map((m) => (
              <MarketRow key={m.symbol} {...m} />
            ))}
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
