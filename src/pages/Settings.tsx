import { useEffect, useState } from "react";
import {
  api,
  tokenStore,
  type UserPreferences,
  type UserKyc,
  type KycPayload,
} from "../api/client";
import { useI18n, LOCALES } from "../i18n";
import { applyTheme, THEMES, type ThemeId } from "../lib/theme";
import { setTimeZone, COMMON_TZ } from "../lib/timezone";
import { validatePassword } from "../lib/validate";

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
    doc_front: "",
    doc_back: "",
  });
  const [kycMsg, setKycMsg] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, p, k] = await Promise.all([
          api.userMe(),
          api.userGetPreferences(),
          api.userKycGet(),
        ]);
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

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("settings.title")}</h2>
      </div>

      {loading && <div className="muted">{t("common.loading")}</div>}
      {err && <div className="error">{t("common.loadError", { err })}</div>}

      <section className="card">
        <div className="card-head">
          <h3>{t("settings.profile")}</h3>
        </div>
        <div className="wform">
          <label>
            {t("settings.nickname")}
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t("settings.ph.nickname")} maxLength={32} />
          </label>
          <label>
            {t("settings.avatar")}
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={t("settings.ph.url")} />
          </label>
          <button className="submit" onClick={saveProfile}>
            {t("settings.saveProfile")}
          </button>
          {profileMsg && (
            <div className={isFail(profileMsg, "settings.profileFail", t) ? "error" : "ok"}>{profileMsg}</div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("settings.pwd")}</h3>
        </div>
        <div className="wform">
          <label>
            {t("settings.oldPwd")}
            <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          </label>
          <label>
            {t("settings.newPwd")}
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </label>
          <button className="submit" onClick={savePassword}>
            {t("settings.changePwd")}
          </button>
          {pwdMsg && <div className={isFail(pwdMsg, "settings.pwdFail", t) ? "error" : "ok"}>{pwdMsg}</div>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("settings.tfa")}</h3>
          <span className={tfaEnabled ? "ostatus completed" : "ostatus unknown"}>
            {tfaEnabled ? t("settings.tfaOn") : t("settings.tfaOff")}
          </span>
        </div>
        <div className="wform">
          {!tfaEnabled && !tfaSecret && (
            <button className="submit" onClick={tfaSetupStart}>
              {t("settings.tfaEnableStart")}
            </button>
          )}
          {tfaSecret && (
            <>
              <div className="otc-hint">
                {t("settings.tfaHint")}
              </div>
              <label>
                {t("settings.tfaSecret")}
                <input value={tfaSecret} readOnly />
              </label>
              {tfaUri && (
                <label>
                  {t("settings.tfaUri")}
                  <input value={tfaUri} readOnly />
                </label>
              )}
              <label>
                {t("settings.tfaCode")}
                <input value={tfaCode} onChange={(e) => setTfaCode(e.target.value)} placeholder={t("settings.tfaCodePh")} />
              </label>
              <button className="submit" onClick={tfaEnable}>
                {t("settings.tfaEnable")}
              </button>
            </>
          )}
          {tfaEnabled && (
            <>
              <label>
                {t("settings.tfaCodeClose")}
                <input value={tfaCode} onChange={(e) => setTfaCode(e.target.value)} placeholder={t("settings.tfaCodePh")} />
              </label>
              <button className="link-btn" onClick={tfaDisable}>
                {t("settings.tfaDisable")}
              </button>
            </>
          )}
          {tfaMsg && <div className={tfaError ? "error" : "ok"}>{tfaMsg}</div>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("settings.kyc")}</h3>
          <span className={`ostatus ${kycLevel === 2 ? "completed" : kycLevel === 1 ? "disputed" : kycLevel === 3 ? "cancelled" : "unknown"}`}>
            {t(KYC_KEY[kycLevel] ?? "home.kyc.unverified")}
          </span>
        </div>
        <div className="wform">
          {kyc && (
            <div className="otc-hint">
              {t("settings.kycStatus", {
                label: t(KYC_KEY[kyc.status] ?? "home.kyc.unverified"),
                reason: kyc.status === 3 && kyc.reject_reason ? t("settings.kycReason", { reason: kyc.reject_reason }) : "",
                name: kyc.real_name ? t("settings.kycName", { name: kyc.real_name, number: kyc.id_number }) : "",
              })}
            </div>
          )}
          {kyc?.status === 1 ? (
            <div className="muted">{t("settings.kycReviewing")}</div>
          ) : (
            <>
              <label>
                {t("settings.realName")}
                <input
                  value={kycForm.real_name}
                  onChange={(e) => setKycForm({ ...kycForm, real_name: e.target.value })}
                  placeholder={t("settings.realNamePh")}
                />
              </label>
              <label>
                {t("settings.idType")}
                <select
                  value={kycForm.id_type}
                  onChange={(e) => setKycForm({ ...kycForm, id_type: e.target.value })}
                >
                  <option value="id_card">{t("settings.idCard")}</option>
                  <option value="passport">{t("settings.passport")}</option>
                  <option value="driver_license">{t("settings.driverLicense")}</option>
                </select>
              </label>
              <label>
                {t("settings.idNumber")}
                <input
                  value={kycForm.id_number}
                  onChange={(e) => setKycForm({ ...kycForm, id_number: e.target.value })}
                  placeholder={t("settings.idNumberPh")}
                />
              </label>
              <label>
                {t("settings.docFront")}
                <input
                  value={kycForm.doc_front}
                  onChange={(e) => setKycForm({ ...kycForm, doc_front: e.target.value })}
                  placeholder={t("settings.ph.url")}
                />
              </label>
              <label>
                {t("settings.docBack")}
                <input
                  value={kycForm.doc_back}
                  onChange={(e) => setKycForm({ ...kycForm, doc_back: e.target.value })}
                  placeholder={t("settings.ph.url")}
                />
              </label>
              <button className="submit" onClick={submitKyc}>
                {kyc?.status === 3 ? t("settings.resubmitKyc") : t("settings.submitKyc")}
              </button>
            </>
          )}
          {kycMsg && <div className={isFail(kycMsg, "settings.kycFail", t) ? "error" : "ok"}>{kycMsg}</div>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t("settings.prefs")}</h3>
        </div>
        <div className="wform">
          <label>
            {t("settings.theme")}
            <select value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}>
              {THEMES.map((th) => (
                <option key={th.value} value={th.value}>{t(th.key)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("settings.language")}
            <select value={prefs.language} onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}>
              {LOCALES.map((lc) => (
                <option key={lc.value} value={lc.value}>{lc.label}</option>
              ))}
            </select>
          </label>
          <label>
            {t("settings.timezone")}
            <select value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>
              <option value="">{t("settings.tzAuto")}</option>
              {COMMON_TZ.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={prefs.notify_order}
              onChange={(e) => setPrefs({ ...prefs, notify_order: e.target.checked })}
            />
            {t("settings.notifyOrder")}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={prefs.notify_security}
              onChange={(e) => setPrefs({ ...prefs, notify_security: e.target.checked })}
            />
            {t("settings.notifySecurity")}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={prefs.notify_marketing}
              onChange={(e) => setPrefs({ ...prefs, notify_marketing: e.target.checked })}
            />
            {t("settings.notifyMarketing")}
          </label>
          <button className="submit" onClick={savePrefs}>
            {t("settings.savePrefs")}
          </button>
          {prefMsg && (
            <div className={isFail(prefMsg, "settings.prefFail", t) ? "error" : "ok"}>{prefMsg}</div>
          )}
        </div>
      </section>
    </div>
  );
}
