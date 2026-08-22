import { useEffect, useState } from "react";
import {
  api,
  tokenStore,
  type UserPreferences,
  type UserKyc,
  type KycPayload,
  type UserProfile,
  type LoginHistoryEntry,
  type UserSession,
} from "../api/client";
import { useI18n, LOCALES } from "../i18n";
import { applyTheme, THEMES, type ThemeId } from "../lib/theme";
import { setTimeZone, COMMON_TZ } from "../lib/timezone";
import { validatePassword } from "../lib/validate";
import { useSecureAction } from "../components/security/SecureActionProvider";

const DEFAULT_PREFS: UserPreferences = {
  user_id: 0,
  language: "zh-CN",
  theme: "dark",
  timezone: "",
  notify_order: true,
  notify_security: true,
  notify_marketing: false,
};

// KYC 等级 -> 文案 key（对齐 home.kyc.*）。
const KYC_KEY = ["home.kyc.unverified", "home.kyc.reviewing", "home.kyc.verified", "home.kyc.rejected"];

function applyLang(lang: string) {
  document.documentElement.lang = lang;
}

// 失败文案模板前缀（用于判断消息是否为错误）。
function isFail(msg: string, failKey: string, t: (k: string, v?: Record<string, string | number>) => string): boolean {
  return msg.startsWith(t(failKey, { err: "" }));
}

export function Settings() {
  const { t } = useI18n();
  // 资料
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [profileMsg, setProfileMsg] = useState("");

  // 改密
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  // 偏好
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [prefMsg, setPrefMsg] = useState("");

  // 两步验证 (TFA)
  const [tfaEnabled, setTfaEnabled] = useState(false);
  const [tfaSecret, setTfaSecret] = useState("");
  const [tfaUri, setTfaUri] = useState("");
  const [tfaCode, setTfaCode] = useState("");
  const [tfaMsg, setTfaMsg] = useState("");
  const [tfaError, setTfaError] = useState(false);

  // KYC
  const [kycLevel, setKycLevel] = useState(0);
  const [kyc, setKyc] = useState<UserKyc | null>(null);
  const [kycForm, setKycForm] = useState<KycPayload>({
    real_name: "",
    id_type: "id_card",
    id_number: "",
    doc_front_name: "",
    doc_back_name: "",
  });
  const [kycMsg, setKycMsg] = useState("");

  // 账户信息
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // 登录历史
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);

  // 会话管理
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionMsg, setSessionMsg] = useState("");

  // 防钓鱼码
  const [phishingCode, setPhishingCode] = useState("");
  const [phishingMsg, setPhishingMsg] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, p, k, hist, sess, ph] = await Promise.all([
          api.userMe(),
          api.userGetPreferences(),
          api.userKycGet(),
          api.loginHistory({ limit: 20 }),
          api.sessions(),
          api.antiPhishingGet(),
        ]);
        setProfile(me);
        setNickname(me.nickname ?? "");
        setAvatar(me.avatar ?? "");
        setTfaEnabled(me.tfa_enabled);
        setKycLevel(me.kyc_level);
        const merged = { ...DEFAULT_PREFS, ...p };
        setPrefs(merged);
        applyTheme(merged.theme as ThemeId);
        applyLang(merged.language);
        setTimeZone(merged.timezone || "");
        setKyc(k.kyc);
        setLoginHistory(hist);
        setSessions(sess);
        setPhishingCode(ph.code || "");
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveProfile = async () => {
    setProfileMsg("");
    try {
      await api.userUpdateProfile({ nickname, avatar });
      setProfileMsg(t("settings.profileSaved"));
    } catch (e) {
      setProfileMsg(t("settings.profileFail", { err: (e as Error).message }));
    }
  };

  const secureAction = useSecureAction();

  const savePassword = async () => {
    setPwdMsg("");
    if (!oldPwd || !newPwd) {
      setPwdMsg(t("settings.pwdNeed"));
      return;
    }
    if (!validatePassword(newPwd)) {
      setPwdMsg(t("settings.pwdWeak"));
      return;
    }
    // 高危操作拦截：修改密码需通过滑块 + 2FA/邮箱验证码二次验证
    const verified = await secureAction.verify({ action: "password" });
    if (!verified) {
      setPwdMsg(t("settings.pwdVerifyCancelled"));
      return;
    }
    try {
      const r = await api.userChangePassword(oldPwd, newPwd);
      setPwdMsg(r.message || t("settings.pwdChanged"));
      setOldPwd("");
      setNewPwd("");
      // 后端已吊销全部 refresh token，强制重新登录以保证会话一致。
      tokenStore.clear();
      setTimeout(() => {
        location.hash = "/login";
      }, 800);
    } catch (e) {
      setPwdMsg(t("settings.pwdFail", { err: (e as Error).message }));
    }
  };

  const savePrefs = async () => {
    setPrefMsg("");
    try {
      await api.userUpdatePreferences(prefs);
      applyTheme(prefs.theme as ThemeId);
      applyLang(prefs.language);
      setTimeZone(prefs.timezone || "");
      setPrefMsg(t("settings.prefSaved"));
    } catch (e) {
      setPrefMsg(t("settings.prefFail", { err: (e as Error).message }));
    }
  };

  const tfaSetupStart = async () => {
    setTfaMsg("");
    setTfaError(false);
    try {
      const r = await api.userTfaSetup();
      setTfaSecret(r.secret);
      setTfaUri(r.otpauth_uri);
    } catch (e) {
      setTfaMsg(t("settings.tfaSecretFail", { err: (e as Error).message }));
      setTfaError(true);
    }
  };
  const tfaEnable = async () => {
    if (!tfaCode) {
      setTfaMsg(t("settings.tfaEnterCode"));
      setTfaError(false);
      return;
    }
    try {
      await api.userTfaEnable(tfaCode);
      setTfaEnabled(true);
      setTfaSecret("");
      setTfaUri("");
      setTfaCode("");
      setTfaMsg(t("settings.tfaEnabled"));
      setTfaError(false);
    } catch (e) {
      setTfaMsg(t("settings.tfaEnableFail", { err: (e as Error).message }));
      setTfaError(true);
    }
  };
  const tfaDisable = async () => {
    if (!tfaCode) {
      setTfaMsg(t("settings.tfaEnterCode"));
      setTfaError(false);
      return;
    }
    try {
      await api.userTfaDisable(tfaCode);
      setTfaEnabled(false);
      setTfaCode("");
      setTfaMsg(t("settings.tfaDisabled"));
      setTfaError(false);
    } catch (e) {
      setTfaMsg(t("settings.tfaDisableFail", { err: (e as Error).message }));
      setTfaError(true);
    }
  };

  const submitKyc = async () => {
    setKycMsg("");
    if (!kycForm.real_name || !kycForm.id_number) {
      setKycMsg(t("settings.kycNeed"));
      return;
    }
    try {
      const r = await api.userKycSubmit(kycForm);
      setKycLevel(r.kyc_level);
      const k = await api.userKycGet();
      setKyc(k.kyc);
      setKycMsg(r.message || t("settings.kycSubmitted"));
    } catch (e) {
      setKycMsg(t("settings.kycFail", { err: (e as Error).message }));
    }
  };

  const revokeSession = async (id: string) => {
    setSessionMsg("");
    try {
      await api.sessionRevoke(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setSessionMsg(t("settings.sessionRevokeFail", { err: (e as Error).message }));
    }
  };

  const revokeAllSessions = async () => {
    setSessionMsg("");
    try {
      const r = await api.sessionRevokeAll();
      setSessions((prev) => prev.filter((s) => s.current));
      setSessionMsg(t("settings.sessionRevoked", { count: r.revoked }));
    } catch (e) {
      setSessionMsg(t("settings.sessionRevokeFail", { err: (e as Error).message }));
    }
  };

  const savePhishing = async () => {
    setPhishingMsg("");
    try {
      await api.antiPhishingSet(phishingCode);
      setPhishingMsg(t("settings.antiPhishingSaved"));
    } catch (e) {
      setPhishingMsg(t("settings.antiPhishingFail", { err: (e as Error).message }));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("settings.title")}</h2>
      </div>

      {loading && <div className="mono">{t("common.loading")}</div>}
      {err && <div className="error">{t("common.loadError", { err })}</div>}

      {/* 账户信息 */}
      {profile && (
        <section className="card">
          <div className="card-head">
            <h3>{t("settings.accountInfo")}</h3>
          </div>
          <div className="kv">
            <div className="kv-row"><span className="kv-k">{t("settings.userId")}</span><span className="kv-v mono">{profile.user_id}</span></div>
            <div className="kv-row"><span className="kv-k">{t("settings.email")}</span><span className="kv-v">{profile.email || "--"} {profile.email_verified ? <span className="ok" style={{ marginLeft: 8 }}>✓</span> : null}</span></div>
            <div className="kv-row"><span className="kv-k">{t("settings.phone")}</span><span className="kv-v">{profile.phone || "--"} {profile.phone_verified ? <span className="ok" style={{ marginLeft: 8 }}>✓</span> : null}</span></div>
            <div className="kv-row"><span className="kv-k">{t("settings.accountStatus")}</span><span className="kv-v ok">{t("settings.active")}</span></div>
          </div>
        </section>
      )}

      {/* 资料 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.profile")}</h3>
        </div>
        <div className="card-body">
          <div className="form-field">
            <label className="form-label">{t("settings.nickname")}</label>
            <input className="filter" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t("settings.ph.nickname")} maxLength={32} />
          </div>
          <div className="form-field">
            <label className="form-label">{t("settings.avatar")}</label>
            <input className="filter" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={t("settings.ph.url")} />
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={saveProfile}>
              {t("settings.saveProfile")}
            </button>
          </div>
          {profileMsg && (
            <div className={isFail(profileMsg, "settings.profileFail", t) ? "error" : "ok"}>{profileMsg}</div>
          )}
        </div>
      </section>

      {/* 修改密码 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.pwd")}</h3>
        </div>
        <div className="card-body">
          <div className="form-field">
            <label className="form-label">{t("settings.oldPwd")}</label>
            <input className="filter" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">{t("settings.newPwd")}</label>
            <input className="filter" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={savePassword}>
              {t("settings.changePwd")}
            </button>
          </div>
          {pwdMsg && <div className={isFail(pwdMsg, "settings.pwdFail", t) ? "error" : "ok"}>{pwdMsg}</div>}
        </div>
      </section>

      {/* 两步验证 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.tfa")}</h3>
          <span className={tfaEnabled ? "ok" : "mono"}>
            {tfaEnabled ? t("settings.tfaOn") : t("settings.tfaOff")}
          </span>
        </div>
        <div className="card-body">
          {!tfaEnabled && !tfaSecret && (
            <div className="card-actions">
              <button className="btn primary" onClick={tfaSetupStart}>
                {t("settings.tfaEnableStart")}
              </button>
            </div>
          )}
          {tfaSecret && (
            <>
              <div className="form-hint">
                {t("settings.tfaHint")}
              </div>
              <div className="form-field">
                <label className="form-label">{t("settings.tfaSecret")}</label>
                <input className="filter mono" value={tfaSecret} readOnly />
              </div>
              {tfaUri && (
                <div className="form-field">
                  <label className="form-label">{t("settings.tfaUri")}</label>
                  <input className="filter mono" value={tfaUri} readOnly />
                </div>
              )}
              <div className="form-field">
                <label className="form-label">{t("settings.tfaCode")}</label>
                <input className="filter" value={tfaCode} onChange={(e) => setTfaCode(e.target.value)} placeholder={t("settings.tfaCodePh")} />
              </div>
              <div className="card-actions">
                <button className="btn primary" onClick={tfaEnable}>
                  {t("settings.tfaEnable")}
                </button>
              </div>
            </>
          )}
          {tfaEnabled && (
            <>
              <div className="form-field">
                <label className="form-label">{t("settings.tfaCodeClose")}</label>
                <input className="filter" value={tfaCode} onChange={(e) => setTfaCode(e.target.value)} placeholder={t("settings.tfaCodePh")} />
              </div>
              <div className="card-actions">
                <button className="btn danger" onClick={tfaDisable}>
                  {t("settings.tfaDisable")}
                </button>
              </div>
            </>
          )}
          {tfaMsg && <div className={tfaError ? "error" : "ok"}>{tfaMsg}</div>}
        </div>
      </section>

      {/* 防钓鱼码 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.antiPhishing")}</h3>
          {phishingCode && <span className="ok">{phishingCode}</span>}
        </div>
        <div className="card-body">
          <div className="form-hint">{t("settings.antiPhishingDesc")}</div>
          <div className="form-field">
            <label className="form-label">{t("settings.antiPhishingCode")}</label>
            <input className="filter" value={phishingCode} onChange={(e) => setPhishingCode(e.target.value)} placeholder={t("settings.antiPhishingPh")} maxLength={20} />
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={savePhishing}>
              {t("settings.saveProfile")}
            </button>
            {phishingCode && (
              <button className="btn danger" onClick={() => { setPhishingCode(""); }}>
                {t("settings.antiPhishingClear")}
              </button>
            )}
          </div>
          {phishingMsg && <div className={isFail(phishingMsg, "settings.antiPhishingFail", t) ? "error" : "ok"}>{phishingMsg}</div>}
        </div>
      </section>

      {/* KYC */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.kyc")}</h3>
          <span className={kycLevel === 2 ? "ok" : kycLevel === 1 ? "mono" : kycLevel === 3 ? "error" : "mono"}>
            {t(KYC_KEY[kycLevel] ?? "home.kyc.unverified")}
          </span>
        </div>
        <div className="card-body">
          {kyc && (
            <div className="form-hint">
              {t("settings.kycStatus", {
                label: t(KYC_KEY[kyc.status] ?? "home.kyc.unverified"),
                reason: kyc.status === 3 && kyc.reject_reason ? t("settings.kycReason", { reason: kyc.reject_reason }) : "",
                name: kyc.real_name ? t("settings.kycName", { name: kyc.real_name, number: kyc.id_number }) : "",
              })}
            </div>
          )}
          {kyc?.status === 1 ? (
            <div className="mono">{t("settings.kycReviewing")}</div>
          ) : (
            <>
              <div className="form-field">
                <label className="form-label">{t("settings.realName")}</label>
                <input
                  className="filter"
                  value={kycForm.real_name}
                  onChange={(e) => setKycForm({ ...kycForm, real_name: e.target.value })}
                  placeholder={t("settings.realNamePh")}
                />
              </div>
              <div className="form-field">
                <label className="form-label">{t("settings.idType")}</label>
                <select
                  className="form-select"
                  value={kycForm.id_type}
                  onChange={(e) => setKycForm({ ...kycForm, id_type: e.target.value })}
                >
                  <option value="id_card">{t("settings.idCard")}</option>
                  <option value="passport">{t("settings.passport")}</option>
                  <option value="driver_license">{t("settings.driverLicense")}</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">{t("settings.idNumber")}</label>
                <input
                  className="filter"
                  value={kycForm.id_number}
                  onChange={(e) => setKycForm({ ...kycForm, id_number: e.target.value })}
                  placeholder={t("settings.idNumberPh")}
                />
              </div>
              <div className="form-field">
                <label className="form-label">{t("settings.docFront")}</label>
                <input
                  className="filter"
                  value={kycForm.doc_front_name}
                  onChange={(e) => setKycForm({ ...kycForm, doc_front_name: e.target.value })}
                  placeholder={t("settings.ph.url")}
                />
              </div>
              <div className="form-field">
                <label className="form-label">{t("settings.docBack")}</label>
                <input
                  className="filter"
                  value={kycForm.doc_back_name}
                  onChange={(e) => setKycForm({ ...kycForm, doc_back_name: e.target.value })}
                  placeholder={t("settings.ph.url")}
                />
              </div>
              <div className="card-actions">
                <button className="btn primary" onClick={submitKyc}>
                  {kyc?.status === 3 ? t("settings.resubmitKyc") : t("settings.submitKyc")}
                </button>
              </div>
            </>
          )}
          {kycMsg && <div className={isFail(kycMsg, "settings.kycFail", t) ? "error" : "ok"}>{kycMsg}</div>}
        </div>
      </section>

      {/* 偏好设置 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.prefs")}</h3>
        </div>
        <div className="card-body">
          <div className="form-field">
            <label className="form-label">{t("settings.theme")}</label>
            <select className="form-select" value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}>
              {THEMES.map((th) => (
                <option key={th.value} value={th.value}>{t(th.key)}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">{t("settings.language")}</label>
            <select className="form-select" value={prefs.language} onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}>
              {LOCALES.map((lc) => (
                <option key={lc.value} value={lc.value}>{lc.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">{t("settings.timezone")}</label>
            <select className="form-select" value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>
              <option value="">{t("settings.tzAuto")}</option>
              {COMMON_TZ.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-check">
              <input
                type="checkbox"
                checked={prefs.notify_order}
                onChange={(e) => setPrefs({ ...prefs, notify_order: e.target.checked })}
              />
              {t("settings.notifyOrder")}
            </label>
          </div>
          <div className="form-field">
            <label className="form-check">
              <input
                type="checkbox"
                checked={prefs.notify_security}
                onChange={(e) => setPrefs({ ...prefs, notify_security: e.target.checked })}
              />
              {t("settings.notifySecurity")}
            </label>
          </div>
          <div className="form-field">
            <label className="form-check">
              <input
                type="checkbox"
                checked={prefs.notify_marketing}
                onChange={(e) => setPrefs({ ...prefs, notify_marketing: e.target.checked })}
              />
              {t("settings.notifyMarketing")}
            </label>
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={savePrefs}>
              {t("settings.savePrefs")}
            </button>
          </div>
          {prefMsg && (
            <div className={isFail(prefMsg, "settings.prefFail", t) ? "error" : "ok"}>{prefMsg}</div>
          )}
        </div>
      </section>

      {/* 登录历史 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.loginHistory")}</h3>
        </div>
        <div className="table-wrap">
          {loginHistory.length === 0 ? (
            <div className="mono" style={{ padding: 12 }}>{t("settings.noHistory")}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("settings.loginIp")}</th>
                  <th>{t("settings.loginLocation")}</th>
                  <th>{t("settings.loginDevice")}</th>
                  <th>{t("settings.loginTime")}</th>
                  <th>{t("settings.accountStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="mono">{h.ip}</td>
                    <td>{h.location}</td>
                    <td className="cell-clamp" title={h.ua}>{h.ua.length > 40 ? h.ua.slice(0, 40) + "…" : h.ua}</td>
                    <td className="mono">{new Date(h.created_at).toLocaleString()}</td>
                    <td>
                      <span className={h.success ? "ok" : "error"}>
                        {h.success ? t("settings.loginSuccess") : t("settings.loginFailed")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 会话管理 */}
      <section className="card">
        <div className="card-head">
          <h3>{t("settings.sessions")}</h3>
          {sessions.filter((s) => !s.current).length > 0 && (
            <button className="btn danger" onClick={revokeAllSessions}>
              {t("settings.sessionRevokeAll")}
            </button>
          )}
        </div>
        <div className="card-body">
          {sessions.length === 0 ? (
            <div className="mono">{t("settings.noSessions")}</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("settings.loginIp")}</th>
                    <th>{t("settings.loginLocation")}</th>
                    <th>{t("settings.loginDevice")}</th>
                    <th>{t("settings.loginTime")}</th>
                    <th>{t("settings.accountStatus")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.ip}</td>
                      <td>{s.location}</td>
                      <td className="cell-clamp" title={s.ua}>{s.ua.length > 40 ? s.ua.slice(0, 40) + "…" : s.ua}</td>
                      <td className="mono">{new Date(s.last_active_at).toLocaleString()}</td>
                      <td>
                        {s.current ? (
                          <span className="ok">{t("settings.sessionCurrent")}</span>
                        ) : null}
                      </td>
                      <td>
                        {!s.current && (
                          <button className="link-btn danger" onClick={() => revokeSession(s.id)}>
                            {t("settings.sessionRevoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sessionMsg && <div className={isFail(sessionMsg, "settings.sessionRevokeFail", t) ? "error" : "ok"} style={{ marginTop: 8 }}>{sessionMsg}</div>}
        </div>
      </section>
    </div>
  );
}
