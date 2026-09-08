import Fastify from "fastify";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { authRoutes } from "./routes/auth.js";
import { roomRoutes } from "./routes/rooms.js";

const app = Fastify({ logger: true });

// 请求级用户上下文:统一置 null,由认证 preHandler 填充(见 auth.ts)
// 注意:Fastify 5 的钩子必须 async(或自行调用 next),同步箭头函数会让请求永久挂起
app.addHook("onRequest", async (req) => {
  req.user = null;
});

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

authRoutes(app);
roomRoutes(app);

const start = async () => {
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
