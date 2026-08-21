import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

/**
 * 基础页面骨架：吸顶 Header + 弹性主内容区 + Footer。
 * 默认暗黑主题（Midnight Black），由 [data-theme] 驱动（见 src/styles/tailwind.css）。
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
