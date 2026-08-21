// 高频数据节流调度器：N ms 窗口内多次 push 只在窗口尾沿 flush 一次最新值。
// 用于盘口/成交等高频流（100ms 推送）限制 React 渲染频率，杜绝每报文一刷。

// 开发环境全局计数器：供冒烟测试测量真实 flush 次数（生产构建剔除）。
type FlushCounter = { __throttleFlushes?: number };

export class ThrottleScheduler<T> {
  private pending: T | null = null;
  private hasPending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushAt = 0;

  constructor(
    private flush: (value: T) => void,
    private intervalMs: number = 100
  ) {}

  /** 写入最新值；窗口内合并，尾沿统一刷出（保证最终值不丢）。 */
  push(value: T): void {
    this.pending = value;
    this.hasPending = true;
    if (this.timer !== null) return;

    const elapsed = Date.now() - this.lastFlushAt;
    const wait = Math.max(0, this.intervalMs - elapsed);
    this.timer = setTimeout(() => this.flushNow(), wait);
  }

  /** 立即刷出挂起值（测试/卸载前用）。 */
  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.hasPending) return;
    const value = this.pending as T;
    this.pending = null;
    this.hasPending = false;
    this.lastFlushAt = Date.now();
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      const g = globalThis as FlushCounter;
      g.__throttleFlushes = (g.__throttleFlushes ?? 0) + 1;
    }
    this.flush(value);
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.hasPending = false;
  }
}
