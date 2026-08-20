import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { isValidAccount, validatePassword } from "../lib/validate";

export function Register() {
  const { t } = useI18n();
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [referralCode, setReferralCode] = useState(() => {
    // 从 URL hash 参数 ?ref=XXX 自动填充邀请码
    const m = location.hash.match(/[?&]ref=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setErr("");
    if (!target.trim()) return setErr(t("register.needAccount"));
    if (!isValidAccount(target)) return setErr(t("register.errAccount"));
    setBusy(true);
    try {
      const r = await api.sendCode(target.trim(), "register");
      setMsg(r.message || t("register.codeSent"));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!isValidAccount(target)) return setErr(t("register.errAccount"));
    if (!validatePassword(password)) return setErr(t("register.errPassword"));
    setBusy(true);
    try {
      await api.register(target.trim(), password, code.trim(), referralCode.trim() || undefined);
      setMsg(t("register.success"));
      setTimeout(() => (location.hash = "/login"), 800);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h2>{t("register.title")}</h2>
        <label>
          {t("register.account")}
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="user1" />
        </label>
        <label>
          {t("register.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </label>
        <div className="code-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("register.code")}
          />
          <button type="button" onClick={sendCode} disabled={busy}>
            {t("register.getCode")}
          </button>
        </div>
        <label>
          {t("register.referralCode")}
          <input
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder={t("register.referralCodePlaceholder")}
          />
        </label>
        {err && <div className="error">{t("register.fail", { err })}</div>}
        {msg && <div className="ok">{msg}</div>}
        <button type="submit" disabled={busy}>
          {busy ? t("register.submitting") : t("register.submit")}
        </button>
        <div className="switch">
          {t("register.hasAccount")}<a href="#/login">{t("register.login")}</a>
        </div>
      </form>
    </div>
  );
}
