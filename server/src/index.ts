import Fastify from "fastify";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";

const app = Fastify({ logger: true });

// 健康检查:验证 Web 服务、PostgreSQL、Redis 三方连通(部署探活也用它)
app.get("/api/health", async () => {
  let pg = "ok";
  let redisStatus = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    pg = "down";
  }
  try {
    await redis.ping();
  } catch {
    redisStatus = "down";
  }
  return { ok: pg === "ok" && redisStatus === "ok", pg, redis: redisStatus };
});

const start = async () => {
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
