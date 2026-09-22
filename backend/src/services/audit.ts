import { db, uuid, nowIso, jstr } from "../db";

export async function audit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  oldValue?: unknown,
  newValue?: unknown
) {
  try {
    await db
      .insertInto("auditLogs")
      .values({
        id: uuid(),
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        oldValue: oldValue === undefined ? null : jstr(oldValue),
        newValue: newValue === undefined ? null : jstr(newValue),
        createdAt: nowIso(),
      })
      .execute();
  } catch (e) {
    console.error("audit failed", e);
  }
}
