import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dir = fileURLToPath(new URL("../migrations/", import.meta.url));

export async function migrate(url: string, log = console.log) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(dir + file, "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into _migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required");
  await migrate(url);
}
