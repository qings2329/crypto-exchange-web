import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 全局 QueryClient：
// - 行情类数据默认 30s 内视为新鲜，避免高频重复请求；
// - 失败重试 1 次（指数退避由 TanStack 默认策略提供）；
// - 窗口聚焦不自动刷新（行情实时性由 WebSocket 负责）。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
