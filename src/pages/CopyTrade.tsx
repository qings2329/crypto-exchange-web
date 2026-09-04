import { useEffect, useState } from "react";
import { api, type CopyLead, type CopyFollow, type CopyRecord } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";

function fmtTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export function CopyTrade() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"leads" | "follows" | "copies">("leads");

  // Leads
  const [leads, setLeads] = useState<CopyLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [errLeads, setErrLeads] = useState("");

  // Follow form
  const [followForm, setFollowForm] = useState<{ leadId: number; ratio: string; amount: string }>({
    leadId: 0, ratio: "1", amount: "100",
  });
  const [followMsg, setFollowMsg] = useState("");

  // My follows
  const [follows, setFollows] = useState<CopyFollow[]>([]);
  const [followsLoading, setFollowsLoading] = useState(false);
  const [errFollows, setErrFollows] = useState("");

  // My copies
  const [copies, setCopies] = useState<CopyRecord[]>([]);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [errCopies, setErrCopies] = useState("");

  const loadLeads = async () => {
    setLeadsLoading(true);
    setErrLeads("");
    try { setLeads(await api.copyLeads()); }
    catch (e: any) { setErrLeads(e?.message ?? ""); }
    finally { setLeadsLoading(false); }
  };

  const loadFollows = async () => {
    setFollowsLoading(true);
    setErrFollows("");
    try { setFollows(await api.copyMyFollows()); }
    catch (e: any) { setErrFollows(e?.message ?? ""); }
    finally { setFollowsLoading(false); }
  };

  const loadCopies = async () => {
    setCopiesLoading(true);
    setErrCopies("");
    try { setCopies(await api.copyMyCopies()); }
    catch (e: any) { setErrCopies(e?.message ?? ""); }
    finally { setCopiesLoading(false); }
  };

  useEffect(() => { loadLeads(); }, []);

  const handleFollow = async () => {
    setFollowMsg("");
    if (!followForm.leadId || parseFloat(followForm.ratio) <= 0) {
      setFollowMsg(t("copytrade.ratioInvalid"));
      return;
    }
    try {
      await api.copyFollow({
        lead_id: followForm.leadId,
        copy_ratio: parseFloat(followForm.ratio),
        allocated_amount: parseFloat(followForm.amount) || 0,
        follower_token: "",
      });
      setFollowMsg(t("copytrade.followSuccess"));
      loadFollows();
      loadLeads();
    } catch (e: any) {
      setFollowMsg(e?.message ?? t("copytrade.followFailed"));
    }
  };

  const handleStopFollow = async (id: number) => {
    try {
      await api.copyStopFollow(id);
      loadFollows();
      loadLeads();
    } catch { /* silent */ }
  };

  const activeLeads = leads.filter((l) => l.status === "active");
  const activeFollows = follows.filter((f) => f.status === "active");

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("copytrade.title")}</h2>
      </div>

      {/* Tabs */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
          {(["leads", "follows", "copies"] as const).map((tabDef) => (
            <button
              key={tabDef}
              onClick={() => {
                setTab(tabDef);
                if (tabDef === "follows") loadFollows();
                if (tabDef === "copies") loadCopies();
              }}
              style={{
                padding: "4px 12px",
                marginRight: 8,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: tab === tabDef ? "var(--accent)" : "transparent",
                color: tab === tabDef ? "var(--accent-foreground)" : "var(--muted-foreground)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {tabDef === "leads" ? t("copytrade.tabLeads")
               : tabDef === "follows" ? t("copytrade.tabMyFollows")
               : t("copytrade.tabMyCopies")}
            </button>
          ))}
        </div>
      </div>

      {/* Leads tab */}
      {tab === "leads" && (
        <div>
          <InlineError err={errLeads} />
          {leadsLoading && <p className="muted">{t("common.loading")}</p>}
          {!leadsLoading && activeLeads.length === 0 && (
            <p className="muted">{t("copytrade.noLeads")}</p>
          )}
          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 12 }}>
            {activeLeads.map((lead) => {
              const isFollowing = activeFollows.some((f) => f.lead_id === lead.id);
              return (
                <div key={lead.id} className="card">
                  <div className="card-head">
                    <span style={{ fontWeight: 600 }}>{lead.name}</span>
                    <span className="ostatus completed" style={{ marginLeft: 8 }}>{t("copytrade.leadActive")}</span>
                  </div>
                  {lead.bio && <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0" }}>{lead.bio}</p>}
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "4px 0" }}>
                    UID {lead.id} · {fmtTime(lead.created_at)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {isFollowing ? (
                      <button className="btn" disabled style={{ width: "100%" }}>{t("copytrade.alreadyFollowing")}</button>
                    ) : (
                      <button
                        className="btn"
                        onClick={() => setFollowForm({ leadId: lead.id, ratio: "1", amount: "100" })}
                        style={{ width: "100%", background: "#F0B90B", color: "#000", fontWeight: 600 }}
                      >
                        {t("copytrade.follow")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Follow form */}
          {followForm.leadId > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <h3>{t("copytrade.followTitle")}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3" style={{ padding: "12px 16px" }}>
                <div className="form-field">
                  <span className="form-label">{t("copytrade.copyRatio")}</span>
                  <input className="filter" type="number" step="0.1" min="0.1"
                    value={followForm.ratio}
                    onChange={(e) => setFollowForm({ ...followForm, ratio: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <span className="form-label">{t("copytrade.allocatedAmount")}</span>
                  <input className="filter" type="number" step="1" min="0"
                    value={followForm.amount}
                    onChange={(e) => setFollowForm({ ...followForm, amount: e.target.value })}
                  />
                </div>
              </div>
              {followMsg && (
                <div style={{ padding: "0 16px 8px", fontSize: 12, color: followMsg.includes("成功") ? "var(--success)" : "var(--destructive)" }}>
                  {followMsg}
                </div>
              )}
              <div className="row-actions" style={{ padding: "0 16px 12px" }}>
                <button className="btn" onClick={() => setFollowForm({ ...followForm, leadId: 0 })}>
                  {t("common.cancel")}
                </button>
                <button className="btn" onClick={handleFollow}
                  style={{ background: "#F0B90B", color: "#000", fontWeight: 600 }}>
                  {t("copytrade.confirmFollow")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* My Follows tab */}
      {tab === "follows" && (
        <div className="card">
          <div className="card-head">
            <h3>{t("copytrade.myFollowsTitle")}</h3>
          </div>
          <InlineError err={errFollows} />
          {followsLoading && <p className="muted" style={{ padding: 16 }}>{t("common.loading")}</p>}
          {!followsLoading && follows.length === 0 && (
            <p className="muted" style={{ padding: 16 }}>{t("copytrade.noFollows")}</p>
          )}
          {follows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("copytrade.colLead")}</th>
                  <th>{t("copytrade.colRatio")}</th>
                  <th>{t("copytrade.colAllocated")}</th>
                  <th>{t("col.status")}</th>
                  <th>{t("col.time")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {follows.map((f) => (
                  <tr key={f.id}>
                    <td className="num">{f.lead_id}</td>
                    <td>{f.copy_ratio}x</td>
                    <td className="num">${(f.allocated_amount ?? 0).toFixed(2)}</td>
                    <td>
                      <span className={`ostatus ${f.status === "active" ? "completed" : "cancelled"}`}>
                        {f.status === "active" ? t("copytrade.stActive") : t("copytrade.stStopped")}
                      </span>
                    </td>
                    <td className="muted">{fmtTime(f.created_at)}</td>
                    <td>
                      {f.status === "active" && (
                        <button className="btn" onClick={() => handleStopFollow(f.id)}
                          style={{ color: "var(--destructive)" }}>
                          {t("copytrade.stop")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* My Copies tab */}
      {tab === "copies" && (
        <div className="card">
          <div className="card-head">
            <h3>{t("copytrade.myCopiesTitle")}</h3>
          </div>
          <InlineError err={errCopies} />
          {copiesLoading && <p className="muted" style={{ padding: 16 }}>{t("common.loading")}</p>}
          {!copiesLoading && copies.length === 0 && (
            <p className="muted" style={{ padding: 16 }}>{t("copytrade.noCopies")}</p>
          )}
          {copies.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("col.symbol")}</th>
                  <th>{t("col.side")}</th>
                  <th>{t("col.price")}</th>
                  <th>{t("col.qty")}</th>
                  <th>{t("copytrade.colNotional")}</th>
                  <th>{t("col.status")}</th>
                  <th>{t("col.time")}</th>
                </tr>
              </thead>
              <tbody>
                {copies.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.id}</td>
                    <td className="font-mono">{c.symbol}</td>
                    <td>
                      <span style={{ color: c.side === "buy" ? "var(--success)" : "var(--destructive)" }}>
                        {c.side}
                      </span>
                    </td>
                    <td className="num">{c.price}</td>
                    <td className="num">{c.qty}</td>
                    <td className="num">${(c.notional ?? 0).toFixed(2)}</td>
                    <td>
                      <span className={`ostatus ${c.status === "done" ? "completed" : "cancelled"}`}>
                        {c.status === "done" ? t("copytrade.copyDone") : t("copytrade.copyFailed")}
                      </span>
                    </td>
                    <td className="muted">{fmtTime(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
