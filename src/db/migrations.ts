import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "./postgres.js";

interface MigrationRow {
  name: string;
}

export async function runMigrations(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const dir = path.join(process.cwd(), "src", "db", "migrations");
  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = await sql<MigrationRow[]>`SELECT name FROM schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.name));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const migrationSql = await readFile(path.join(dir, file), "utf8");
    await sql.unsafe(migrationSql);
    await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
  }
}
