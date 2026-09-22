// Database bootstrap: Kysely over node:sqlite (dev: DATABASE_URL=file:...)
// or node-postgres (production: DATABASE_URL=postgresql://...).
import { Kysely, PostgresDialect, SqliteDialect, CamelCasePlugin, sql } from "kysely";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs";
import type { Database } from "./types";
import { NodeSqliteDatabase } from "./sqlite-node";

export type { Database };
export { sql };

function isSqliteUrl(url: string): boolean {
  return url.startsWith("file:") || url.endsWith(".db") || url.startsWith("sqlite:");
}

function sqlitePath(url: string): string {
  const p = url.replace(/^file:/, "").replace(/^sqlite:/, "");
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function createDb(): { db: Kysely<Database>; dialect: "sqlite" | "postgres" } {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (isSqliteUrl(url)) {
    const file = sqlitePath(url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const database = new NodeSqliteDatabase(file);
    const db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database,
        onCreateConnection: async (conn) => {
          await conn.executeQuery(sql`PRAGMA journal_mode = WAL`.compile(db as never) as never);
          await conn.executeQuery(sql`PRAGMA foreign_keys = ON`.compile(db as never) as never);
        },
      }),
      plugins: [new CamelCasePlugin()],
    });
    return { db, dialect: "sqlite" };
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
  return { db, dialect: "postgres" };
}

const { db, dialect } = createDb();

export { db };
export const dbDialect = dialect;

// ---------- Small helpers used across the codebase ----------

export function uuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Normalize a DB timestamp (Date on pg, string on sqlite) to ISO string. */
export function ts(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function tsNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return ts(v);
}

export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "true" || v === "1" || v === "t";
  return Boolean(v);
}

export function jparse<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== "string") return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export function jstr(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v ?? null);
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
