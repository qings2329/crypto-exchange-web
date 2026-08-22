// 防重复提交 Hook：防抖 (debounce) + 接口冷却 (cool-down) 二合一。
// - debounceMs：点击后延迟执行，窗口内的连点合并为一次；
// - cooldownMs：执行成功后的接口冷却期，冷却期内所有调用直接忽略
//   （冷却表挂在模块级 Map 上，跨组件卸载/重挂载仍然生效）。
import { useEffect, useRef, useState, useCallback } from "react";

/** 模块级冷却表：key -> 上次执行完成时刻（ms） */
const cooldownTable = new Map<string, number>();

export interface GuardedOptions {
  /** 冷却键：同键共享冷却（如 "send-code:email"）；缺省用 fn 身份 */
  key?: string;
  /** 执行后的接口冷却时长（ms），默认 1000 */
  cooldownMs?: number;
  /** 防抖窗口（ms），默认 300；0 表示立即执行 */
  debounceMs?: number;
}

export interface GuardedApi {
  run: (...args: unknown[]) => void;
  cooling: boolean;
  /** 冷却剩余毫秒（用于按钮文案倒计时） */
  remainingMs: number;
}

export function useGuardedAction(fn: (...args: unknown[]) => unknown, opts: GuardedOptions = {}): GuardedApi {
  const { key, cooldownMs = 1000, debounceMs = 300 } = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const keyId = key ?? "__anon";
  const coolUntil = cooldownTable.get(keyId) ?? 0;

  const [now, setNow] = useState(() => Date.now());
  const cooling = coolUntil > now;
  const remainingMs = Math.max(0, coolUntil - now);

  // 冷却期内每秒跳针驱动重渲染（按钮倒计时）
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooling]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false); // 防抖窗口锁

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const run = useCallback(
    (...args: unknown[]) => {
      if (pendingRef.current) return; // 防抖窗口内重复点击
      const until = cooldownTable.get(keyId) ?? 0;
      if (until > Date.now()) return; // 接口冷却中
      pendingRef.current = true;
      timerRef.current = setTimeout(
        () => {
          pendingRef.current = false;
          void Promise.resolve(fnRef.current(...args)).finally(() => {
            cooldownTable.set(keyId, Date.now() + cooldownMs);
            setNow(Date.now());
          });
        },
        Math.max(0, debounceMs)
      );
    },
    [keyId, cooldownMs, debounceMs]
  );

  return { run, cooling, remainingMs };
}
