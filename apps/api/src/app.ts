import type { Db } from "@g3/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { adminRoutes } from "./admin/routes.ts";
import type { Config } from "./env.ts";
import { authRoutes } from "./tenant/auth-routes.ts";
import { tenantRoutes } from "./tenant/routes.ts";

export interface AppDeps {
  db: Db; // g3_app — subject to RLS
  platformDb: Db; // g3_platform — admin API only
  config: Config;
}

export function createApp({ db, platformDb, config }: AppDeps) {
  const app = new OpenAPIHono();
  app.use("*", secureHeaders());
  app.use(
    "*",
    csrf({
      origin: (origin) =>
        origin === config.webOrigin || (!config.secureCookies && origin.startsWith("http://localhost:")),
    }),
  );

  app.use("/api/*", async (c, next) => {
    c.set("db" as never, db as never);
    c.set("config" as never, config as never);
    await next();
  });
  app.use("/admin-api/*", async (c, next) => {
    c.set("platformDb" as never, platformDb as never);
    c.set("config" as never, config as never);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Auth routes are mounted before the authenticated tenant router so its
  // "*" auth middleware never sees them.
  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1", tenantRoutes);
  app.route("/admin-api/v1", adminRoutes);

  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "G3Leads API", version: "0.1.0", description: "Tenant + platform-admin API" },
  });
  app.get("/api/docs", Scalar({ url: "/api/openapi.json", pageTitle: "G3Leads API" }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
