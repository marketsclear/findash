/**
 * Copy the local file cache (data/*.json) into the Postgres store, so a fresh deployment starts
 * with history instead of running the 40-minute backfill from a CI runner.
 *
 *   DATABASE_URL=postgres://... pnpm store:push
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const dir = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
  const client = neon(url);
  await client`create table if not exists findash_store (key text primary key, value jsonb not null, updated_at timestamptz not null default now())`;
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const key = file.slice(0, -5);
    const value = await readFile(path.join(dir, file), "utf8");
    await client`insert into findash_store (key, value, updated_at) values (${key}, ${value}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
    console.log(`pushed ${key} (${Math.round(value.length / 1024)} KB)`);
  }
}

void main();
