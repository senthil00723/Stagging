import { createDb } from "@g3/db";
import { serve } from "@hono/node-server";
import pino from "pino";
import { createApp } from "./app.ts";
import { loadConfig } from "./env.ts";

const log = pino({ name: "g3-api" });
const config = loadConfig();
const tenant = createDb(process.env.DATABASE_URL ?? "postgres://g3_app:g3_app_dev@localhost:5432/g3leads");
const platform = createDb(
  process.env.PLATFORM_DATABASE_URL ?? "postgres://g3_platform:g3_platform_dev@localhost:5432/g3leads",
  4,
);

const app = createApp({ db: tenant.db, platformDb: platform.db, config });
const port = Number(process.env.API_PORT ?? 4000);
const server = serve({ fetch: app.fetch, port }, () => log.info({ port }, "API listening; docs at /api/docs"));

const shutdown = async () => {
  server.close();
  await Promise.all([tenant.close(), platform.close()]);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
