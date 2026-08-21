// 节流状态 Hook：高频推送（盘口 100ms / 成交流）合并为最多 intervalMs 一次 setState，
// 将 React 重渲染频率限制在目标窗口（默认 100ms 一刷），组件卸载自动清理。
import { useEffect, useRef, useState } from "react";
import { ThrottleScheduler } from "../lib/throttle-scheduler";

export function useThrottledState<T>(initial: T, intervalMs = 100): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const schedulerRef = useRef<ThrottleScheduler<T> | null>(null);

  if (schedulerRef.current === null) {
    schedulerRef.current = new ThrottleScheduler<T>(setValue, intervalMs);
  }

  useEffect(() => {
    return () => schedulerRef.current?.dispose();
  }, []);

  return [value, (v: T) => schedulerRef.current?.push(v)];
}
