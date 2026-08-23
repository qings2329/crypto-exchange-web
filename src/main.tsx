import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initMonitor } from "./lib/monitor";
import { initTheme } from "./lib/theme";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles/tailwind.css";

// 首屏即应用主题（默认暗色），保证 <html data-theme> 与 color-scheme 就绪，
// 避免原生下拉/输入框在暗色界面下呈现白底白字。
initTheme();

// 启用监控上报（错误/接口异常/WS 掉线/Web Vitals -> 后端聚合）。
// 后端未实现 /api/v1/monitor/* 时上报静默失败，不影响业务；本仓库已提供统一网关实现。
initMonitor({
  enabled: true,
  endpoint: "/api/v1/monitor/report",
});

// 开发环境暴露 store 引用，供 Playwright 冒烟测试直接种子数据（生产构建不含）。
if (import.meta.env.DEV) {
  void Promise.all([import("./store/orders-store"), import("./store/futures-store")]).then(
    ([orders, futures]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__ordersStore = orders.useOrdersStore;
      w.__futuresStore = futures.useFuturesStore;
    }
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
