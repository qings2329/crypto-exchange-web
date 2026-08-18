import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// 开发服务器通过代理把 /api 转发到后端网关（:8787），
// 避免跨域，前端用相对路径调用即可。
// 构建体积分析：设置 ANALYZE=true 时生成 dist/stats.html（见 README 性能优化）。
const plugins: PluginOption[] = [react()];
if (process.env.ANALYZE) {
  plugins.push(
    visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true, template: "treemap" })
  );
}

export default defineConfig({
  plugins,
  server: {
    port: 5173,
    proxy: {
      // REST 与 WebSocket 都走网关（ws:true 支持升级）。
      // 默认 :8787（见 server/gateway.mjs）；可用 BACKEND_TARGET 环境变量覆盖（例如本地 mock 跑在别的端口时）。
      "/api": { target: process.env.BACKEND_TARGET || "http://localhost:8787", ws: true },
    },
  },
});
