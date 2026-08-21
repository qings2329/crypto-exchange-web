import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// 开发服务器通过代理把 /api 转发到后端网关（:8787），
// 避免跨域，前端用相对路径调用即可。
// 构建体积分析：设置 ANALYZE=true 时生成 dist/stats.html（见 README 性能优化）。
const plugins: PluginOption[] = [react(), tailwindcss()];
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
      // REST 与 WebSocket 都走后端（ws:true 支持升级）。
      // 开发默认指向仓库内 mock 网关 :8787（见 mock/gateway.mjs，仅联调用）；
      // 对接真实后端（crypto-exchange Go 网关）时用 BACKEND_TARGET 覆盖。
      "/api": { target: process.env.BACKEND_TARGET || "http://localhost:8787", ws: true },
    },
  },
});
