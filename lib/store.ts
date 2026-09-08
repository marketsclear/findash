import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

/**
 * Tiny key → JSON store, one entry per collector.
 *  - With DATABASE_URL set: a `findash_store` table in Postgres (Neon). Used in production, where the
 *    web app and the GitHub Actions collector share the same rows.
 *  - Otherwise: files under data/ (override with FINDASH_DATA_DIR). Used for local development.
 */
const DATA_DIR = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
const TABLE = "findash_store";

export function storeBackend(): "postgres" | "files" {
  return process.env.DATABASE_URL ? "postgres" : "files";
}

let ready: Promise<void> | null = null;
function sql() {
  const client = neon(process.env.DATABASE_URL!);
  ready ??= client`create table if not exists findash_store (key text primary key, value jsonb not null, updated_at timestamptz not null default now())`.then(() => {});
  return { client, ready };
}

export async function readStore<T>(key: string): Promise<T | null> {
  if (storeBackend() === "postgres") {
    const { client, ready } = sql();
    await ready;
    const rows = await client`select value from findash_store where key = ${key}`;
    return rows.length ? (rows[0].value as T) : null;
  }
  try {
    const raw = await readFile(path.join(DATA_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeStore<T>(key: string, value: T): Promise<void> {
  if (storeBackend() === "postgres") {
    const { client, ready } = sql();
    await ready;
    await client`insert into findash_store (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${key}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export { TABLE as STORE_TABLE };
