import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initMonitor } from "./lib/monitor";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles/tailwind.css";

// 启用监控上报（错误/接口异常/WS 掉线/Web Vitals -> 后端聚合）。
// 后端未实现 /api/v1/monitor/* 时上报静默失败，不影响业务；本仓库已提供统一网关实现。
initMonitor({
  enabled: true,
  endpoint: "/api/v1/monitor/report",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
