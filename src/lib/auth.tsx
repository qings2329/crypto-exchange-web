import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../api/client";

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
