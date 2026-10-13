import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(url: string, max = 10) {
  const client = postgres(url, { max, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, client, close: () => client.end() };
}

/**
 * Run `fn` inside a transaction with `app.org_id` set, so every query is
 * filtered by Row-Level Security. This is the ONLY way tenant code should
 * touch tenant tables.
 */
export function withTenant<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
