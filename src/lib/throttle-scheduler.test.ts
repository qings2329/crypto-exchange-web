import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThrottleScheduler } from "./throttle-scheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ThrottleScheduler", () => {
  it("窗口内多次 push 只 flush 一次最新值", () => {
    const seen: number[] = [];
    const s = new ThrottleScheduler<number>((v) => seen.push(v), 100);

    s.push(1);
    s.push(2);
    s.push(3);
    expect(seen).toEqual([]); // 窗口内不刷

    vi.advanceTimersByTime(100);
    expect(seen).toEqual([3]); // 尾沿刷出最新值
    s.dispose();
  });

  it("连续窗口持续推送按节拍刷出", () => {
    const seen: number[] = [];
    const s = new ThrottleScheduler<number>((v) => seen.push(v), 100);

    for (let i = 1; i <= 10; i++) {
      s.push(i);
      vi.advanceTimersByTime(50);
    }
    // 500ms 内约 5~6 次 flush（首窗尾沿 + 后续每 100ms）
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen.length).toBeLessThanOrEqual(6);
    expect(seen.at(-1)).toBeGreaterThanOrEqual(9); // 最新值最终刷出
    s.dispose();
  });

  it("dispose 丢弃挂起值并不再触发", () => {
    const seen: number[] = [];
    const s = new ThrottleScheduler<number>((v) => seen.push(v), 100);
    s.push(42);
    s.dispose();
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([]);
  });

  it("flushNow 立即刷出挂起值", () => {
    const seen: number[] = [];
    const s = new ThrottleScheduler<number>((v) => seen.push(v), 100);
    s.push(7);
    s.flushNow();
    expect(seen).toEqual([7]);
    s.dispose();
  });
});
