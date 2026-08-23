import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../api/client";
import { isPublicRoute } from "./routes";

// 用户前端仅存在「已登录 / 未登录」两种状态，不区分角色（无管理员/运营概念）。
type UserRole = string | null;

interface AuthCtxValue {
  uid: string | null;
  role: UserRole;
  login: (target: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthCtxValue>({
  uid: null,
  role: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(tokenStore.uid);
  const [role, setRole] = useState<UserRole>(tokenStore.role ?? null);

  // 会话失效（令牌过期且刷新失败）时，由 request() 派发 auth:expired，
  // 这里同步清空 React 登录态，保证顶栏/守卫与 localStorage 一致。
  useEffect(() => {
    const onExpired = () => {
      setUid(null);
      setRole(null);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  // 启动时用 /user/me 校验本地令牌是否仍有效：localStorage 可能残留已失效的令牌
  // （如 mock 网关重启导致 refresh_token 失效）。若不校验，RequireLogin 会凭「令牌存在」
  // 放行钱包页，而余额/提现记录接口却返回 401，表现为「已登录却提示请先登录」。
  // 校验失败（含刷新也失败）即清登录态并跳登录，避免半死状态。
  useEffect(() => {
    if (!tokenStore.access) return;
    let alive = true;
    api
      .userMe()
      .catch(() => {
        if (!alive) return;
        tokenStore.clear();
        setUid(null);
        setRole(null);
        if (typeof location !== "undefined" && !isPublicRoute()) location.hash = "/login";
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = async (target: string, password: string) => {
    const res = await api.login(target, password);
    tokenStore.set(res.access_token, res.refresh_token, String(res.user_id), res.role);
    setUid(String(res.user_id));
    if (res.role) setRole(res.role);
  };

  const logout = () => {
    const rt = tokenStore.refresh;
    if (rt) api.logout(rt).catch(() => {});
    tokenStore.clear();
    setUid(null);
    setRole(null);
    location.hash = "/login";
  };

  return (
    <AuthCtx.Provider value={{ uid, role, login, logout }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

// 未登录则跳转到登录页。
export function requireAuth(): boolean {
  const hasToken = !!tokenStore.access;
  if (!hasToken) {
    location.hash = "/login";
    return false;
  }
  return true;
}
