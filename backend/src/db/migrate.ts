// Minimal migration runner over raw SQL files in src/db/migrations/*.sql.
// Tracks applied migrations in the `migrations` table.
import fs from "node:fs";
import path from "node:path";
import { db, sql, nowIso } from "./index";

function migrationsDir(): string {
  // Works both in dev (src/db) and prod (dist/db). In prod the SQL files
  // are copied next to the compiled output (see Dockerfile / build script).
  const direct = path.join(__dirname, "migrations");
  if (fs.existsSync(direct)) return direct;
  return path.join(process.cwd(), "src", "db", "migrations");
}

function splitStatements(text: string): string[] {
  const noComments = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runMigrations(): Promise<string[]> {
  // Ensure tracking table exists first (works on fresh DBs)
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    )
  `.execute(db);

  const applied = await db.selectFrom("migrations").select("name").execute();
  const appliedSet = new Set(applied.map((a) => a.name));

  const dir = migrationsDir();
  if (!fs.existsSync(dir)) {
    console.log(`[migrate] no migrations dir at ${dir}, skipping`);
    return [];
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`[migrate] applying ${file}...`);
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const stmt of splitStatements(text)) {
      await sql.raw(stmt).execute(db);
    }
    await db.insertInto("migrations").values({ name: file, appliedAt: nowIso() }).execute();
    ran.push(file);
  }
  if (ran.length) console.log(`[migrate] applied: ${ran.join(", ")}`);
  else console.log("[migrate] up to date");
  return ran;
}

// Allow `node dist/db/migrate.js` as a standalone step (docker entrypoint).
const isMain = process.argv[1]?.endsWith("migrate.js") || process.argv[1]?.endsWith("migrate.ts");
if (isMain) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
