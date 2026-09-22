import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/auth";
import { db, toBool } from "../db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });
    const payload = verifyToken(token);
    const user = await db.selectFrom("users").selectAll().where("id", "=", payload.sub).executeTakeFirst();
    if (!user || !toBool(user.active)) return res.status(401).json({ error: "Account disabled" });
    req.user = { sub: user.id, email: user.email, role: user.role, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const ROLE_RANK: Record<string, number> = { STAFF: 1, MANAGER: 2, ADMIN: 3 };

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "ADMIN") return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function requireMinRole(min: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if ((ROLE_RANK[req.user.role] ?? 0) < (ROLE_RANK[min] ?? 99)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
