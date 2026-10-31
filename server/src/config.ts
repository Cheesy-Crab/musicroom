import "dotenv/config";

/** 开发用默认密钥:生产环境必须显式配置,否则启动失败 */
const DEV_JWT_SECRET = "dev-secret-change-me";
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = (process.env.JWT_SECRET ?? "").trim();

if (
  isProduction &&
  (jwtSecret.length < 32 || jwtSecret === DEV_JWT_SECRET)
) {
  throw new Error(
    "JWT_SECRET must be set to a random value of at least 32 characters in production",
  );
}

/**
 * 跨域白名单:前端与后端同源(Vite 代理 / Caddy 反代),默认不开放跨域;
 * 需要跨域时用 CORS_ORIGINS 显式列出,逗号分隔。
 */
function parseCorsOrigins(value: string | undefined): string[] | false {
  const origins = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : false;
}

/** 集中读取环境变量,所有配置从这里取,便于维护和校验 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: jwtSecret || DEV_JWT_SECRET,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  neteaseApiUrl: process.env.NETEASE_API_URL ?? "http://localhost:3001",
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? 9000),
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
    bucket: process.env.MINIO_BUCKET ?? "musicroom",
  },
} as const;

export const databaseUrl = process.env.DATABASE_URL ?? "";
export const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
