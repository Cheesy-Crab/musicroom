import type { AuthUser } from "./auth.js";

// Fastify 请求扩展:onRequest 钩子统一置 null,认证 preHandler 填充
declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
