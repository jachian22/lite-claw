import postgres, { type Sql } from "postgres";

import { getEnv } from "../config/env.js";

let sqlClient: Sql | null = null;

export function getSql(): Sql {
  if (sqlClient) {
    return sqlClient;
  }

  const env = getEnv();
  sqlClient = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 10,
    connect_timeout: 10,
    prepare: true
  });
  return sqlClient;
}

export async function closeSql(): Promise<void> {
  if (!sqlClient) {
    return;
  }

  await sqlClient.end({ timeout: 5 });
  sqlClient = null;
}
