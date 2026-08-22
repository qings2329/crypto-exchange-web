import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuardedAction } from "./use-guarded-action";

describe("useGuardedAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("防抖：窗口内连点合并为一次执行", async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useGuardedAction(fn, { key: "t1", debounceMs: 300, cooldownMs: 0 }));
    result.current.run();
    act(() => vi.advanceTimersByTime(100));
    result.current.run();
    result.current.run();
    expect(fn).not.toHaveBeenCalled(); // 窗口内未执行
    await act(async () => vi.advanceTimersByTime(400));
    expect(fn).toHaveBeenCalledTimes(1); // 仅一次
  });

  it("冷却：执行后 cooldownMs 内的调用被忽略，过期恢复", async () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useGuardedAction(fn, { key: "t2", debounceMs: 0, cooldownMs: 5000 }));
    result.current.run();
    await act(async () => vi.advanceTimersByTime(50));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.cooling).toBe(true);

    result.current.run(); // 冷却中被忽略
    await act(async () => vi.advanceTimersByTime(200));
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(5200));
    expect(result.current.cooling).toBe(false);
    result.current.run();
    await act(async () => vi.advanceTimersByTime(50));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("同 key 跨实例共享冷却；不同 key 互不影响", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const i1 = renderHook(() => useGuardedAction(a, { key: "shared", debounceMs: 0, cooldownMs: 3000 }));
    i1.result.current.run();
    await act(async () => vi.advanceTimersByTime(50));
    // 新挂载实例共享同一冷却键
    const i2 = renderHook(() => useGuardedAction(a, { key: "shared", debounceMs: 0, cooldownMs: 3000 }));
    expect(i2.result.current.cooling).toBe(true);
    i2.result.current.run();
    await act(async () => vi.advanceTimersByTime(100));
    expect(a).toHaveBeenCalledTimes(1);

    const other = renderHook(() => useGuardedAction(b, { key: "other", debounceMs: 0, cooldownMs: 3000 }));
    expect(other.result.current.cooling).toBe(false); // 不同键不受影响
  });
});
