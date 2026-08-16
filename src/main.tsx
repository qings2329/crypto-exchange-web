import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initMonitor } from "./lib/monitor";
import "./styles.css";

// 生产环境（非 localhost）启用监控上报；开发环境仅在 console 输出，不影响业务。
initMonitor({
  enabled: location.hostname !== "localhost" && location.hostname !== "127.0.0.1",
  endpoint: "/api/v1/monitor/report",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
