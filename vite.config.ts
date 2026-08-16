import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发服务器通过代理把 /api 转发到后端网关（:8080），
// 避免跨域，前端用相对路径调用即可。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // REST 与 WebSocket 都走网关（ws:true 支持升级）。
      // 默认 :8080；可用 BACKEND_TARGET 环境变量覆盖（例如本地 mock 跑在别的端口时）。
      "/api": { target: process.env.BACKEND_TARGET || "http://localhost:8080", ws: true },
    },
  },
});
