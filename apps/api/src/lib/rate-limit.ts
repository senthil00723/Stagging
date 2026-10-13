import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { clientIp } from "./ip.ts";

/**
 * Fixed-window in-memory limiter for auth endpoints. Phase 5 moves this to
 * Redis at the gateway so limits hold across API replicas.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string }): MiddlewareHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return async (c, next) => {
    const now = Date.now();
    const id = `${opts.name}:${clientIp(c)}`;
    const entry = hits.get(id);
    if (!entry || entry.reset < now) {
      hits.set(id, { count: 1, reset: now + opts.windowMs });
    } else if (++entry.count > opts.max) {
      c.header("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      throw new HTTPException(429, { message: "Too many attempts, try again later" });
    }
    await next();
  };
}
