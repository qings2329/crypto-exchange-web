import { useState, type CSSProperties, type ReactNode } from "react";

export interface VirtualListProps<T> {
  items: readonly T[];
  // 单行固定高度（px）。固定行高可避免滚动时抖动，是虚拟化的前提。
  rowHeight: number;
  // 视口高度（px）。超出的行不会进入 DOM。
  height: number;
  renderRow: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
  // 视口上下额外渲染的行数，缓解快速滚动时的白屏。
  overscan?: number;
  className?: string;
  style?: CSSProperties;
}

// 轻量列表虚拟化：仅渲染可视区域内的行，长列表（几百~上万行）内存与渲染开销趋近于常数。
// 适用于固定行高的滚动列表；列对齐由调用方通过 grid 等布局自行保证。
export function VirtualList<T>({
  items,
  rowHeight,
  height,
  renderRow,
  getKey,
  overscan = 4,
  className,
  style,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const total = items.length;
  const viewportCount = Math.ceil(height / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(total, startIndex + viewportCount + overscan * 2);
  const offsetY = startIndex * rowHeight;
  const visible = items.slice(startIndex, endIndex);

  const containerStyle: CSSProperties = {
    height,
    overflowY: "auto",
    position: "relative",
    ...style,
  };

  return (
    <div
      className={className}
      style={containerStyle}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="list"
    >
      <div style={{ height: total * rowHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`,
          }}
        >
          {visible.map((item, i) => {
            const index = startIndex + i;
            const key = getKey ? getKey(item, index) : index;
            return (
              <div key={key} role="listitem" style={{ height: rowHeight }}>
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
