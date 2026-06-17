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

  constructor(private readonly windowMs = 60_000) {}

  /** Returns true if the request is allowed. `maxPerWindow <= 0` disables it. */
  allow(key: string, maxPerWindow: number, now: number = Date.now()): boolean {
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
}
