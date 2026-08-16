import { useState } from "react";
import { useAuth } from "../lib/auth";

export function Login() {
  const { login } = useAuth();
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
        <h2>登录</h2>
        <label>
          账号（邮箱/手机）
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="user1" />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "登录中…" : "登录"}
        </button>
        <div className="switch">
          没有账号？<a href="#/register">注册</a>
        </div>
      </form>
    </div>
  );
}
