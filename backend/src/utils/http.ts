import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodTypeAny, type infer as ZodInfer } from "zod";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function validate<T extends ZodTypeAny>(schema: T, data: unknown): ZodInfer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}

export function pagination(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged<T>(data: T[], total: number, page: number, limit: number) {
  return { data, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } };
}
