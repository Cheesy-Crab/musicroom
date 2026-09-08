import "dotenv/config";

/** 集中读取环境变量,所有配置从这里取,便于维护和校验 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
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
