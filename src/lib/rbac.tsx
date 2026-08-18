import { type ReactNode } from "react";
import { useAuth, requireAuth } from "./auth";
import { useI18n } from "../i18n";

// 角色等级：数值越大权限越高。后台管理页面据此做最小权限守卫。
export type Role = "user" | "operator" | "admin";

const ROLE_RANK: Record<Role, number> = {
  user: 1,
  operator: 2,
  admin: 3,
};

// have 是否具备不低于 need 的权限等级。have 为 null（未登录/无角色）视为最低。
export function roleAtLeast(have: Role | null, need: Role): boolean {
  if (!have) return false;
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

// 在需要权限的页面根部使用：未登录跳转登录页；已登录但权限不足渲染 fallback（默认 403）。
export function RequireRole({
  role,
  children,
  fallback,
}: {
  role: Role;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!requireAuth()) return null; // requireAuth 内部已跳转 /login
  const { role: current } = useAuth();
  if (!roleAtLeast(current, role)) {
    return <>{fallback ?? <Forbidden need={role} />}</>;
  }
  return <>{children}</>;
}

// 命令式判断：当前会话是否具备某角色。未登录返回 false（不跳转）。
export function requireRole(role: Role): boolean {
  if (!requireAuthSilent()) return false;
  const { role: current } = useAuth();
  return roleAtLeast(current, role);
}

// 不跳转地判断登录态（供 requireRole 复用）。
function requireAuthSilent(): boolean {
  try {
    return !!localStorage.getItem("cx_access_token");
  } catch {
    return false;
  }
}

export interface Permission {
  role: Role | null;
  isAdmin: boolean;
  hasRole: (need: Role) => boolean;
}

// 在组件内获取当前权限能力。
export function usePermission(): Permission {
  const { role, isAdmin, hasRole } = useAuth();
  return { role, isAdmin, hasRole };
}

// 无权限统一视图。
export function Forbidden({ need }: { need?: Role }) {
  const { t } = useI18n();
  const desc = need
    ? t("forbidden.desc", { role: t(`nav.role.${need}`) })
    : t("forbidden.descNoRole");
  return (
    <div className="forbidden">
      <div className="forbidden-code">403</div>
      <h2>{t("forbidden.title")}</h2>
      <p className="muted">
        {desc}
        {t("forbidden.contact")}
      </p>
      <a className="btn" href="#/home">
        {t("forbidden.back")}
      </a>
    </div>
  );
}
