import { db, uuid, nowIso } from "../db";

export async function notifyStaff(input: {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
}) {
  try {
    const now = nowIso();
    if (input.userId) {
      await db
        .insertInto("notifications")
        .values({
          id: uuid(),
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          read: false,
          createdAt: now,
        })
        .execute();
      return;
    }
    const users = await db.selectFrom("users").select("id").where("active", "=", true).execute();
    if (!users.length) return;
    await db
      .insertInto("notifications")
      .values(
        users.map((u) => ({
          id: uuid(),
          userId: u.id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          read: false as const,
          createdAt: now,
        }))
      )
      .execute();
  } catch (e) {
    console.error("notify failed", e);
  }
}
