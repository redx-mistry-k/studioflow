// Shared query helpers (portable across postgres + sqlite).
import { sql } from "kysely";

/** Case-insensitive LIKE. Uses sql.ref so CamelCasePlugin still maps identifiers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function contains(_eb: any, column: string, q: string) {
  const needle = `%${String(q).replace(/[%_\\]/g, "").toLowerCase()}%`;
  return sql<boolean>`lower(${sql.ref(column)}) like ${needle}`;
}

export function countRows(row: { count: unknown } | undefined): number {
  return Number(row?.count ?? 0) || 0;
}
