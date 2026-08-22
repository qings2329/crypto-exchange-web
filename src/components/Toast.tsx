import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { subscribeEvents } from "../lib/monitor";
import i18next from "../i18n/i18next";
import { classifyError, errorToText } from "../lib/utils";

export type ToastType = "error" | "success" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

// 提示入参：字符串、Error，或带状态码的对象（如 ApiError / 监控事件）。
// 允许传入错误对象以便按 HTTP 状态码区分 401 与 403，而非依赖文案正则。
export type ToastInput = string | Error | { status?: number; message?: string };

// 把错误归一成最终展示文案：优先按状态码区分 401 / 403（复用统一的 classifyError）。
// 用户前端无管理员/运营角色概念，403 与 401 同样视为「会话失效」引导重新登录；
// 其余情况展示原始报错文本。
function resolveErrorMessage(input: ToastInput): string {
  const kind = classifyError(input);
  if (kind === "unauthorized" || kind === "forbidden") return i18next.t("common.authRequired");
  return errorToText(input);
}

export interface ToastApi {
  // 显示一条通知；type 决定配色，ttl(ms) 为自动消失时长（<=0 不自动消失）。
  show: (message: string, type?: ToastType, ttl?: number) => void;
  error: (input: ToastInput, ttl?: number) => void;
  success: (message: string, ttl?: number) => void;
  info: (message: string, ttl?: number) => void;
  warning: (message: string, ttl?: number) => void;
}

const noop: ToastApi = {
  show: () => {},
  error: () => {},
  success: () => {},
  info: () => {},
  warning: () => {},
};

const ToastCtx = createContext<ToastApi>(noop);

// 包裹应用，提供全局 toast。任意组件内用 useToast() 取得。
// 容器固定在右上角，点击即关闭；默认 4s 自动消失。
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = "info", ttl = 4000) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, type, message }]);
      if (ttl > 0) setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (input, ttl) => show(resolveErrorMessage(input), "error", ttl),
      success: (m, ttl) => show(m, "success", ttl),
      info: (m, ttl) => show(m, "info", ttl),
      warning: (m, ttl) => show(m, "warning", ttl),
    }),
    [show]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

// 把监控模块里的未捕获错误（window.onerror / unhandledrejection / 渲染崩溃）
// 自动转成 error 类 toast，形成「全局错误 UI」闭环。
// 仅在事件为空或首次挂载时把已缓冲错误标记为已读，避免重复弹出历史错误。
export function MonitorToasts() {
  const toast = useToast();
  useEffect(() => {
    let lastTs = 0;
    const unsub = subscribeEvents((events) => {
      for (const e of events) {
        if (e.type !== "error") continue;
        if (e.ts && e.ts <= lastTs) continue; // 已处理（含初始缓冲回放）
        if (e.ts) lastTs = e.ts;
        // 直接把监控事件（含 status）传给 error，使其按状态码路由 401/403 文案。
        toast.error(e);
      }
    });
    return unsub;
  }, [toast]);
  return null;
}
