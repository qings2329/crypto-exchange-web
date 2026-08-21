// 移动端滑动视图容器：多面板横向排列，触摸滑动/点指示器切换（币安 App 交互）。
// 纯 CSS transform 实现，无第三方依赖；lg+ 由父级隐藏。

import { useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface SwipeSlide {
  key: string;
  label: string;
  node: ReactNode;
}

interface Props {
  slides: SwipeSlide[];
  className?: string;
}

const SWIPE_THRESHOLD = 50; // px，超过视为有效滑动

export function MobileSwipeViews({ slides, className }: Props) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clamp = (i: number) => Math.max(0, Math.min(slides.length - 1, i));

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    setDragX(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    if (startX.current !== null) {
      if (dragX < -SWIPE_THRESHOLD) setIndex((i) => clamp(i + 1));
      else if (dragX > SWIPE_THRESHOLD) setIndex((i) => clamp(i - 1));
    }
    startX.current = null;
    setDragX(0);
    setDragging(false);
  };

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* 面板标题 Tab（点击可直达，兼作指示器） */}
      <div className="flex items-center gap-4 border-b border-border px-3">
        {slides.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setIndex(i)}
            data-testid={`swipe-tab-${s.key}`}
            aria-selected={index === i}
            role="tab"
            className={cn(
              "relative cursor-pointer py-2 text-[13px] transition-colors",
              index === i ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            )}
          >
            {s.label}
            {index === i && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* 滑动轨道 */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        data-testid="mobile-swipe-track"
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragging ? dragX : 0}px))`,
            transition: dragging ? "none" : "transform 240ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {slides.map((s) => (
            <div key={s.key} className="h-full w-full shrink-0 overflow-y-auto overscroll-contain">
              {s.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
