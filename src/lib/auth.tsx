import { createContext, useContext, useState, type ReactNode } from "react";
import { api, tokenStore } from "../api/client";

interface AuthCtxValue {
  uid: string | null;
  login: (target: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthCtxValue>({
  uid: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(tokenStore.uid);

  const login = async (target: string, password: string) => {
    const res = await api.login(target, password);
    tokenStore.set(res.access_token, res.refresh_token, String(res.user_id));
    setUid(String(res.user_id));
  };

  const logout = () => {
    const rt = tokenStore.refresh;
    if (rt) api.logout(rt).catch(() => {});
    tokenStore.clear();
    setUid(null);
    location.hash = "/login";
  };

  return (
    <AuthCtx.Provider value={{ uid, login, logout }}>{children}</AuthCtx.Provider>
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
