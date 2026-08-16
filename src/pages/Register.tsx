import { useState } from "react";
import { api } from "../api/client";

export function Register() {
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setErr("");
    if (!target.trim()) return setErr("请先填写账号");
    setBusy(true);
    try {
      const r = await api.sendCode(target.trim(), "register");
      setMsg(r.message || "验证码已发送（演示环境可直接使用）");
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
      setMsg("注册成功，请登录");
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
        <h2>注册</h2>
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
        <div className="code-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="验证码"
          />
          <button type="button" onClick={sendCode} disabled={busy}>
            获取验证码
          </button>
        </div>
        {err && <div className="error">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "提交中…" : "注册"}
        </button>
        <div className="switch">
          已有账号？<a href="#/login">登录</a>
        </div>
      </form>
    </div>
  );
}
