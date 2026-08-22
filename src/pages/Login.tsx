import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(target.trim(), password);
      location.hash = "/trade";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h2>{t("login.title")}</h2>
        <label>
          {t("login.account")}
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="user1" />
        </label>
        <label>
          {t("login.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={busy}>
          {busy ? t("login.submitting") : t("login.submit")}
        </button>
        <div className="demo-accounts">
          <div className="demo-title">{t("login.demoAccounts")}</div>
          <ul>
            <li><code>user1</code> / <code>User@123</code></li>
          </ul>
        </div>
        <div className="switch">
          {t("login.noAccount")}<a href="#/register">{t("login.register")}</a>
        </div>
      </form>
    </div>
  );
}
