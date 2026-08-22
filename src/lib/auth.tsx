import { createContext, useContext, useState, type ReactNode } from "react";
import { api, tokenStore } from "../api/client";
import { roleAtLeast, type Role } from "./rbac";

interface AuthCtxValue {
  uid: string | null;
  role: Role | null;
  login: (target: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  // 是否具备不低于 need 的角色等级。
  hasRole: (need: Role) => boolean;
}

const AuthCtx = createContext<AuthCtxValue>({
  uid: null,
  role: null,
  login: async () => {},
  logout: () => {},
  isAdmin: false,
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(tokenStore.uid);
  const [role, setRole] = useState<Role | null>((tokenStore.role as Role) ?? null);

  const login = async (target: string, password: string) => {
    const res = await api.login(target, password);
    // 用户前端仅允许普通用户：管理员/运营账户即使拿到令牌也拒绝进入（纵深防御，网关已同规则拦截）
    if (res.role && res.role !== "user") {
      throw new Error("该账户为管理/运营账户，请使用管理后台登录");
    }
    tokenStore.set(res.access_token, res.refresh_token, String(res.user_id), res.role);
    setUid(String(res.user_id));
    if (res.role) setRole(res.role as Role);
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
    <AuthCtx.Provider
      value={{
        uid,
        role,
        login,
        logout,
        isAdmin: role === "admin",
        hasRole: (need) => roleAtLeast(role, need),
      }}
    >
      {children}
    </AuthCtx.Provider>
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
