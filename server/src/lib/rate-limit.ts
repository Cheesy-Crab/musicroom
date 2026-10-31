/** 固定窗口限流:单进程、无依赖,用于认证类入口的暴力破解防护。 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly windows = new Map<string, WindowState>();

  constructor({
    limit,
    windowMs,
    maxKeys = 10_000,
  }: {
    limit: number;
    windowMs: number;
    maxKeys?: number;
  }) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new Error("windowMs must be a positive integer");
    }
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** 记录一次尝试并返回是否放行。 */
  hit(key: string): RateLimitResult {
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    const allowed = window.count <= this.limit;
    if (this.windows.size > this.maxKeys) this.prune(now);
    return {
      allowed,
      remaining: Math.max(0, this.limit - window.count),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  /** 成功后清零,避免正常用户被历史失败次数拖累。 */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    // 仍然超限时按插入顺序丢弃最旧的键,避免大量来源把内存撑爆。
    while (this.windows.size > this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}
