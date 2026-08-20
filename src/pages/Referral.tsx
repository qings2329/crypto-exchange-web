import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

export function Referral() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [referrals, setReferrals] = useState<{ user_id: number; nickname: string; email: string; created_at: string }[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [codeRes, refRes, statsRes, commRes] = await Promise.all([
          api.referralCode(),
          api.referrals(),
          api.referralStats(),
          api.referralCommissions({ limit: 50, offset: 0 }),
        ]);
        setCode(codeRes.referral_code);
        setReferrals(refRes.referrals ?? []);
        setTotals(statsRes.totals ?? {});
        setCommissions(commRes.commissions ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyLink = () => {
    const link = `${location.origin}/#/register?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return <div className="page muted">{t("common.loading")}</div>;

  const inviteLink = `${location.origin}/#/register?ref=${code}`;

  return (
    <div className="page">
      <h2>{t("referral.title")}</h2>

      {/* 邀请码与链接 */}
      <section style={{ marginBottom: 24 }}>
        <h3>{t("referral.myCode")}</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, background: "var(--bg-card)", padding: "8px 16px", borderRadius: 6 }}>
            {code}
          </code>
          <button onClick={copyLink}>{copied ? t("referral.copied") : t("referral.copyLink")}</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", wordBreak: "break-all" }}>
          {t("referral.inviteLink")}: {inviteLink}
        </div>
      </section>

      {/* 佣金统计 */}
      <section style={{ marginBottom: 24 }}>
        <h3>{t("referral.earnings")}</h3>
        {Object.keys(totals).length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("referral.noEarnings")}</p>
        ) : (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(totals).map(([asset, amount]) => (
              <div key={asset} className="card" style={{ minWidth: 120, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{asset}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{(amount / 1e6).toFixed(6)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 下线用户列表 */}
      <section style={{ marginBottom: 24 }}>
        <h3>{t("referral.referrals")} ({referrals.length})</h3>
        {referrals.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("referral.noReferrals")}</p>
        ) : (
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{t("referral.userId")}</th>
                <th>{t("referral.nickname")}</th>
                <th>{t("referral.email")}</th>
                <th>{t("referral.joinedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.user_id}</td>
                  <td>{r.nickname || "-"}</td>
                  <td>{r.email || "-"}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 佣金记录 */}
      <section>
        <h3>{t("referral.commissions")}</h3>
        {commissions.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("referral.noCommissions")}</p>
        ) : (
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{t("referral.asset")}</th>
                <th>{t("referral.amount")}</th>
                <th>{t("referral.rate")}</th>
                <th>{t("referral.status")}</th>
                <th>{t("referral.time")}</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.asset}</td>
                  <td>{(c.amount / 1e6).toFixed(6)}</td>
                  <td>{(c.rate * 100).toFixed(1)}%</td>
                  <td>{c.status === 1 ? t("referral.confirmed") : t("referral.pending")}</td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
