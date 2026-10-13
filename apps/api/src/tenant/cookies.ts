import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { Config } from "../env.ts";

export const ACCESS_COOKIE = "g3_at";
export const REFRESH_COOKIE = "g3_rt";
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export function setSessionCookies(c: Context, config: Config, access: string, refresh: string) {
  const base = { httpOnly: true, secure: config.secureCookies, sameSite: "Lax" } as const;
  setCookie(c, ACCESS_COOKIE, access, { ...base, path: "/api", maxAge: ACCESS_TTL_SEC });
  setCookie(c, REFRESH_COOKIE, refresh, { ...base, path: "/api/v1/auth", maxAge: REFRESH_TTL_SEC });
}

export function clearSessionCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE, { path: "/api" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/v1/auth" });
}
