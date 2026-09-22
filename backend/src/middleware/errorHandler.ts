import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/http";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  const e = err as { code?: string; message?: string };
  // Postgres unique violation / SQLite unique constraint
  if (e?.code === "23505" || (e?.message && /UNIQUE constraint failed/i.test(e.message))) {
    return res.status(409).json({ error: "A record with these unique details already exists" });
  }
  if (e?.code === "23503" || (e?.message && /FOREIGN KEY constraint failed/i.test(e.message))) {
    return res.status(400).json({ error: "Related record not found" });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
}
