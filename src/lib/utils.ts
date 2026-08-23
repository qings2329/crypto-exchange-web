import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind 类名（shadcn/ui 约定）：条件类 + 冲突去重。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 判断接口报错是否为鉴权/权限类（令牌缺失、过期、权限不足）。
 * CEX 资产/账户类视图需先登录，不应把原始网关报错直接暴露给用户。
 */
export function isAuthError(err: string): boolean {
  // 仅匹配明确指向「未登录 / 会话失效」的文案，避免把含 token/login/auth/expired 等词的
  // 普通业务报错（如「令牌地址非法」「登录成功」）误判为「请先登录」。
  return /权限|未登录|未鉴权|未携带|令牌|请先登录|登录已过期|unauthorized|not authenticated|session expired/i.test(
    err
  );
}

// 错误语义分类：单页内联报错与 Toast 统一复用此判定，避免各自实现导致不一致。
// - 优先按 HTTP 状态码 / ApiError.status（可靠地区分 401 未登录 与 403 权限不足）；
// - 无状态码的纯文本报错再按鉴权关键词兜底（无法区分 401/403，统一归为 unauthorized）。
export type ErrorKind = "unauthorized" | "forbidden" | null;

export function classifyError(err: unknown): ErrorKind {
  const status =
    err && typeof err === "object" && "status" in err
      ? (err as { status?: number }).status
      : undefined;
  if (typeof status === "number") {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
  }
  const text =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string })?.message ?? "";
  return isAuthError(text) ? "unauthorized" : null;
}

// 把错误归一成可读文本（用于「其他」类错误的原始报错展示）。
export function errorToText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const msg = (err as { message?: string })?.message;
  return msg ?? String(err);
}
