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
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      const [codeRes, refRes, statsRes, commRes] = await Promise.allSettled([
        api.referralCode(),
        api.referrals(),
        api.referralStats(),
        api.referralCommissions({ limit: 50, offset: 0 }),
      ]);
      if (!alive) return;
      if (codeRes.status === "fulfilled") setCode(codeRes.value.referral_code);
      if (refRes.status === "fulfilled") setReferrals(refRes.value.referrals ?? []);
      if (statsRes.status === "fulfilled") setTotals(statsRes.value.totals ?? {});
      if (commRes.status === "fulfilled") setCommissions(commRes.value.commissions ?? []);
      const failed = [codeRes, refRes, statsRes, commRes].some((r) => r.status === "rejected");
      if (failed) setErr(t("common.requestFailed"));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  const copyLink = () => {
    const link = `${location.origin}/#/register?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return <div className="page muted">{t("common.loading")}</div>;

  if (err) {
    return (
      <div className="page">
        <div className="page-head">
          <h2>{t("referral.title")}</h2>
        </div>
        <div className="card">
          <div className="muted" style={{ marginBottom: 12 }}>{err}</div>
          <button className="copy-btn" onClick={retry}>{t("common.retry")}</button>
        </div>
      </div>
    );
  }

  const inviteLink = `${location.origin}/#/register?ref=${code}`;

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("referral.title")}</h2>
      </div>

      {/* 邀请码与链接 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("referral.myCode")}</h3>
        </div>
        <div className="copy-row">
          <code className="mono">{code}</code>
          <button className="copy-btn" onClick={copyLink}>{copied ? t("referral.copied") : t("referral.copyLink")}</button>
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <div className="kv-row">
            <span className="kv-k">{t("referral.inviteLink")}</span>
            <span className="kv-v mono">{inviteLink}</span>
          </div>
        </div>
      </section>

      {/* 佣金统计 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("referral.earnings")}</h3>
        </div>
        {Object.keys(totals).length === 0 ? (
          <div className="muted">{t("referral.noEarnings")}</div>
        ) : (
          <div className="kv">
            {Object.entries(totals).map(([asset, amount]) => (
              <div key={asset} className="kv-row">
                <span className="kv-k">{asset}</span>
                <span className="kv-v mono">{(amount / 1e6).toFixed(6)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 下线用户列表 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("referral.referrals")} ({referrals.length})</h3>
        </div>
        {referrals.length === 0 ? (
          <div className="muted">{t("referral.noReferrals")}</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
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
          </div>
        )}
      </section>

      {/* 佣金记录 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("referral.commissions")}</h3>
        </div>
        {commissions.length === 0 ? (
          <div className="muted">{t("referral.noCommissions")}</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
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
                    <td className="mono">{(c.amount / 1e6).toFixed(6)}</td>
                    <td>{(c.rate * 100).toFixed(1)}%</td>
                    <td>
                      <span className={`ostatus ${c.status === 1 ? "completed" : "pending"}`}>
                        {c.status === 1 ? t("referral.confirmed") : t("referral.pending")}
                      </span>
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
