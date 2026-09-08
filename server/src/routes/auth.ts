import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signToken } from "../auth.js";

const guestBodySchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  avatarUrl: z.url().max(500).optional(),
});

export function authRoutes(app: FastifyInstance) {
  // 游客创建:即建即用返回 JWT;同一游客账号后续可通过登录接口升级绑定
  app.post("/api/auth/guest", async (req, reply) => {
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
