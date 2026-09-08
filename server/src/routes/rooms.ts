import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { hashPassword } from "../lib/password.js";
import type { Prisma } from "../generated/prisma/client.js";

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(30),
  password: z.string().min(4).max(20).optional(),
  maxMembers: z.number().int().min(2).max(200).optional(),
});

/** 房间查询字段(Prisma 7: 标量字段必须放 select,include 只收关系) */
const roomSelect = {
  id: true,
  name: true,
  mode: true,
  maxMembers: true,
  status: true,
  createdAt: true,
  passwordHash: true,
  owner: { select: { id: true, nickname: true, avatarUrl: true } },
} as const;

type RoomWithOwner = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;

/** 对外视图:不暴露 passwordHash,换成 hasPassword 布尔 */
function toRoomView(room: RoomWithOwner) {
  const { passwordHash, ...rest } = room;
  return { ...rest, hasPassword: !!passwordHash };
}

export function roomRoutes(app: FastifyInstance) {
  // 创建房间:创建者即房主
  app.post("/api/rooms", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: "房间名 1-30 字符,密码 4-20 字符" });
    }
    const { name, password, maxMembers } = parsed.data;
    const room = await prisma.room.create({
      data: {
        name,
        ownerId: req.user!.id,
        passwordHash: password ? hashPassword(password) : null,
        maxMembers,
      },
      select: roomSelect,
    });
    return { room: toRoomView(room) };
  });

  // 大厅:开放房间列表(最近的 50 个)
  app.get("/api/rooms", async () => {
    const rooms = await prisma.room.findMany({
      where: { status: "open" },
      select: roomSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { rooms: rooms.map(toRoomView) };
  });

  // 房间详情
  app.get("/api/rooms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const room = await prisma.room.findUnique({
      where: { id },
      select: roomSelect,
    });
    if (!room || room.status !== "open") {
      return reply.code(404).send({ code: "NOT_FOUND", message: "房间不存在或已关闭" });
    }
    return { room: toRoomView(room) };
  });
}
