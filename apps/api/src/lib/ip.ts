import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

// biome-ignore lint/suspicious/noExplicitAny: works for any route context
export function clientIp(c: Context<any, any, any>): string {
  // Behind a trusted load balancer set TRUST_PROXY=1 so X-Forwarded-For is used.
  if (process.env.TRUST_PROXY === "1") {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() in tests has no socket
  }
}
