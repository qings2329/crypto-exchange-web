import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { MobileTabBar } from "./MobileTabBar";

/**
 * 基础页面骨架：吸顶 Header + 弹性主内容区 + Footer。
 * 默认暗黑主题（Midnight Black），由 [data-theme] 驱动（见 src/styles/tailwind.css）。
 * 移动端（<768px）：底部 TabBar 固定导航，内容区预留高度；Footer 隐藏。
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-14 text-foreground md:pb-0">
      <Header />
      <main className="flex-1">{children}</main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <MobileTabBar />
    </div>
  );
}
