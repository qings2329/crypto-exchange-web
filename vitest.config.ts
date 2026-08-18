import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 前端单元测试配置（与 vite.config.ts 分离，避免影响生产构建）。
// 运行：npm run test:fe（单次）/ npm run test:fe:watch（监听）。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
