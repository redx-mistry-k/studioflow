import dotenv from "dotenv";

dotenv.config();

function req(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: req("DATABASE_URL"),
  jwtSecret: req("JWT_SECRET", "dev-only-secret-change-me-please-32chars"),
  jwtExpiresIn: req("JWT_EXPIRES_IN", "7d"),
  corsOrigin: req("CORS_ORIGIN", "*"),
  isDev: (process.env.NODE_ENV || "development") !== "production",
};
