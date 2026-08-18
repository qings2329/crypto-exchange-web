import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { VirtualList } from "./VirtualList";

// 1000 行数据，视口 300px，行高 50px => 视口约 6 行 + overscan 8 = 最多渲染约 14 行。
const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, label: `row-${i}` }));

function rowCount(container: HTMLElement): number {
  return container.querySelectorAll('[role="listitem"]').length;
}

describe("VirtualList", () => {
  it("只渲染可视窗口内的行，而非全部", () => {
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        height={300}
        getKey={(it) => it.id}
        renderRow={(it) => <span>{it.label}</span>}
      />
    );
    // 视口 6 行 + 上下各 4 行 overscan = 14 行
    expect(rowCount(container)).toBeLessThanOrEqual(14);
    expect(rowCount(container)).toBeGreaterThan(0);
  });

  it("初始视口从第一行开始", () => {
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        height={300}
        getKey={(it) => it.id}
        renderRow={(it) => <span>{it.label}</span>}
      />
    );
    expect(container.textContent).toContain("row-0");
    expect(container.textContent).not.toContain("row-500");
  });

  it("滚动后渲染对应窗口的行", () => {
    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={50}
        height={300}
        getKey={(it) => it.id}
        renderRow={(it) => <span>{it.label}</span>}
      />
    );
    const scroller = container.querySelector('[role="list"]') as HTMLElement;
    // 滚到第 500px（约第 10 行），overscan 4 => 起始约第 6 行
    fireEvent.scroll(scroller, { target: { scrollTop: 500 } });
    expect(container.textContent).toContain("row-6");
    expect(container.textContent).not.toContain("row-0");
    expect(container.textContent).not.toContain("row-900");
  });

  it("空列表不渲染任何行", () => {
    const { container } = render(
      <VirtualList items={[]} rowHeight={50} height={300} renderRow={() => <span>x</span>} />
    );
    expect(rowCount(container)).toBe(0);
  });
});
