import { createContext, useContext, useState, type ReactNode } from "react";
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
