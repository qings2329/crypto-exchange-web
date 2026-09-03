import { type ReactNode } from "react";
import { requireAuth } from "./auth";
import { adminToken } from "../api/admin";

// 用户前端只区分「已登录 / 未登录」，不存在运营 / 管理员等角色与权限等级。
// 因此不再提供 RBAC 守卫（RequireRole / usePermission / Forbidden 等），
// 受保护页面只需做登录态守卫：未登录跳转登录页，已登录正常渲染。
export function RequireLogin({ children }: { children: ReactNode }) {
  if (!requireAuth()) return null; // requireAuth 内部已跳转 /login
  return <>{children}</>;
}

/**
 * 管理后台登录态守卫：管理后台使用独立 JWT（cx_admin_token），
 * 与用户端登录态 (cx_access_token) 无关。未持有管理令牌则跳转 #/admin/login。
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  if (!adminToken.get()) {
    if (typeof location !== "undefined") location.hash = "/admin/login";
    return null;
  }
  return <>{children}</>;
}
