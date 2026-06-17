/** Origin allowlist check. Empty allowlist => allow everything. */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  const o = origin.replace(/\/+$/, '').toLowerCase();
  return allowed.some((a) => a.replace(/\/+$/, '').toLowerCase() === o);
}

/** Simple in-memory sliding-window rate limiter keyed by an arbitrary string. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly windowMs = 60_000) {}

  /** Returns true if the request is allowed. `maxPerWindow <= 0` disables it. */
  allow(key: string, maxPerWindow: number, now: number = Date.now()): boolean {
    this.sweep(now);
    if (maxPerWindow <= 0) return true;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= maxPerWindow) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /**
   * Drop keys whose timestamps have all aged out so the map can't grow without
   * bound across many distinct IPs over a long uptime. Runs at most once per
   * window, so it's amortized O(1) per request.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
