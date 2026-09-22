import { db, nowIso } from "../db";
import { mapSettings } from "../db/map";

export async function getSettings() {
  let row = await db.selectFrom("businessSettings").selectAll().where("id", "=", "default").executeTakeFirst();
  if (!row) {
    row = await db
      .insertInto("businessSettings")
      .values({ id: "default", updatedAt: nowIso() })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  return mapSettings(row);
}
