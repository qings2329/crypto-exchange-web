import { useCallback, useEffect, useState } from "react";

/**
 * 管理后台通用数据拉取 hook：loading / error / refresh 标准化。
 * loader 为接收 action（switch：'reload' | 'refresh'）的 Promise 工厂，便于复用同页搜索。
 */
export function useAdminData<T>(
  loader: (ctrl: { reload: boolean }) => Promise<T>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (reload = false) => {
      setLoading(true);
      setErr("");
      try {
        const d = await loader({ reload });
        setData(d);
      } catch (e) {
        setErr((e as Error).message || "加载失败");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, err, reload: () => load(true) };
}
