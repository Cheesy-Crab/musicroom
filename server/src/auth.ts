import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

/** 请求上下文中挂载的用户(游客与注册用户同构) */
export interface AuthUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

const TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 天

export function signToken(userId: string): string {
  return jwt.sign({}, config.jwtSecret, {
    subject: userId,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** 解析 Bearer token → 用户;无效或缺失返回 null */
export async function resolveUser(req: FastifyRequest): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const userId = verifyToken(header.slice("Bearer ".length));
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    isGuest: user.isGuest,
  };
}

/** preHandler: 必须登录,未登录返回 401 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(req);
  if (!user) {
    return reply.code(401).send({ code: "UNAUTHORIZED", message: "请先登录" });
  }
  req.user = user;
}
