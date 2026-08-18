import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

export function Register() {
  const { t } = useI18n();
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setErr("");
    if (!target.trim()) return setErr(t("register.needAccount"));
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
    setBusy(true);
    try {
      await api.register(target.trim(), password, code.trim());
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
