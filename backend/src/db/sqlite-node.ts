// Adapter: Node.js built-in `node:sqlite` (zero native deps) →
// Kysely's SqliteDatabase interface (better-sqlite3 compatible).
// Also normalizes params (Date → ISO string, boolean → 0/1).

import { DatabaseSync, StatementSync } from "node:sqlite";
import type { SqliteDatabase, SqliteStatement } from "kysely";

function mapParam(p: unknown): unknown {
  if (p instanceof Date) return p.toISOString();
  if (typeof p === "boolean") return p ? 1 : 0;
  if (typeof p === "bigint") return Number(p);
  return p;
}

function isReader(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  if (/^(select|with|values|pragma|explain)\b/.test(s)) return true;
  // INSERT/UPDATE/DELETE ... RETURNING returns rows (mirror better-sqlite3 `.reader`)
  const noStrings = s.replace(/'(?:[^']|'')*'/g, "''");
  return /\breturning\b/.test(noStrings);
}

class NodeSqliteStatement implements SqliteStatement {
  readonly reader: boolean;
  private stmt: StatementSync;
  constructor(stmt: StatementSync, sql: string) {
    this.stmt = stmt;
    this.reader = isReader(sql);
  }
  all(parameters: ReadonlyArray<unknown>): unknown[] {
    const rows = this.stmt.all(...(parameters.map(mapParam) as [])) as Record<string, unknown>[];
    return rows.map((r) => ({ ...r }));
  }
  run(parameters: ReadonlyArray<unknown>): { changes: number | bigint; lastInsertRowid: number | bigint } {
    const r = this.stmt.run(...(parameters.map(mapParam) as [])) as { changes: number | bigint; lastInsertRowid: number | bigint };
    return { changes: r.changes ?? 0, lastInsertRowid: r.lastInsertRowid ?? 0 };
  }
  *iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    const it = this.stmt.iterate(...(parameters.map(mapParam) as [])) as IterableIterator<unknown>;
    for (const row of it) yield { ...(row as Record<string, unknown>) };
  }
}

export class NodeSqliteDatabase implements SqliteDatabase {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }
  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatement(this.db.prepare(sql), sql);
  }
  close(): void {
    this.db.close();
  }
  /** Direct access for pragmas / multi-statement exec (migrations). */
  get raw(): DatabaseSync {
    return this.db;
  }
}
