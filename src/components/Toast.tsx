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

export type ToastType = "error" | "success" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ToastApi {
  // 显示一条通知；type 决定配色，ttl(ms) 为自动消失时长（<=0 不自动消失）。
  show: (message: string, type?: ToastType, ttl?: number) => void;
  error: (message: string, ttl?: number) => void;
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
      error: (m, ttl) => show(m, "error", ttl),
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
        toast.error(e.message || "发生未知错误");
      }
    });
    return unsub;
  }, [toast]);
  return null;
}
