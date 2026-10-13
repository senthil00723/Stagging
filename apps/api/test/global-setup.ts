import { migrate } from "@g3/db/migrate";
import postgres from "postgres";

export const TEST_OWNER_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/g3leads_test";

export default async function setup() {
  const sql = postgres(TEST_OWNER_URL, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`create schema public`;
  await sql.end();
  await migrate(TEST_OWNER_URL, () => {});
}
