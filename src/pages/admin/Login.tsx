import { useState, type FormEvent } from "react";
import { adminApi, adminToken } from "../../api/admin";

// 管理后台登录页：独立于用户端登录，使用 /api/admin/login 签发独立 JWT。
export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await adminApi.login({ username, password, totp: totp || undefined });
      if (res.totp_required && !totp) {
        setTotpRequired(true);
        setErr("请输入谷歌验证码");
        setBusy(false);
        return;
      }
      adminToken.set(res.token);
      location.hash = "/admin/dashboard";
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-bold">管理后台登录</h2>
        {err && <div className="mb-3 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">{err}</div>}
        <div className="flex flex-col gap-3">
          <input
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            placeholder="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {totpRequired && (
            <input
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              placeholder="谷歌验证码（6位）"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-lg bg-accent font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
        <a href="#/home" className="mt-4 block text-center text-xs text-muted hover:text-accent">
          ← 返回用户端
        </a>
      </form>
    </div>
  );
}
