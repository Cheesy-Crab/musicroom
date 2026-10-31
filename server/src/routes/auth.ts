import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signToken } from "../auth.js";
import { FixedWindowLimiter } from "../lib/rate-limit.js";

const guestBodySchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  avatarUrl: z.url().max(500).optional(),
});

/** 游客创建限流:同一来源每分钟最多 10 次,防止批量刷号。 */
const guestLimiter = new FixedWindowLimiter({ limit: 10, windowMs: 60_000 });

export function authRoutes(app: FastifyInstance) {
  // 游客创建:即建即用返回 JWT;同一游客账号后续可通过登录接口升级绑定
  app.post("/api/auth/guest", async (req, reply) => {
    const limit = guestLimiter.hit(req.ip);
    if (!limit.allowed) {
      reply.header("retry-after", limit.retryAfterSeconds);
      return reply
        .code(429)
        .send({ code: "RATE_LIMITED", message: "请求过于频繁,请稍后再试" });
    }
    const parsed = guestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: "昵称需为 1-30 个字符" });
    }
    const { nickname, avatarUrl } = parsed.data;
    const user = await prisma.user.create({
      data: {
        nickname:
          nickname ??
          `听众${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
        avatarUrl,
        isGuest: true,
      },
    });
    return {
      token: signToken(user.id),
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        isGuest: true,
      },
    };
  });

  // 当前用户信息:前端启动时用本地 token 恢复会话
  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    return { user: req.user };
  });
}
