import { runMigrations } from "./migrations.js";
import { closeSql } from "./postgres.js";

async function main(): Promise<void> {
  await runMigrations();
  await closeSql();
  console.log("migrations applied");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
