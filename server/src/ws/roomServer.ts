import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getUserByToken } from "../auth.js";
import { verifyPassword } from "../lib/password.js";
import { FixedWindowLimiter } from "../lib/rate-limit.js";
import * as state from "./state.js";
import {
  advance,
  startSong,
  stopPlayback,
  sweepCloseRooms,
  updatePlayback,
} from "./playback.js";
import type { MemberInfo } from "./types.js";

const joinSchema = z.object({
  roomId: z.string().min(1),
  password: z.string().optional(),
});
const addSchema = z.object({ songId: z.string().min(1) });
const entrySchema = z.object({ entryId: z.string().min(1) });
const controlSchema = z.object({
  action: z.enum(["play", "pause", "seek"]),
  positionMs: z.number().min(0).optional(),
});
const modeSchema = z.object({ mode: z.enum(["sync", "free"]) });

function err(socket: Socket, code: string, message: string): void {
  socket.emit("error", { code, message });
}

/** 房间密码重试限流:同一用户每分钟最多 5 次错误尝试,防止在线爆破。 */
const joinPasswordLimiter = new FixedWindowLimiter({
  limit: 5,
  windowMs: 60_000,
});

export function initRoomServer(io: Server): void {
  // WS 鉴权:与 REST 共用 JWT(游客 token 同样有效)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("unauthorized"));
      const user = await getUserByToken(token);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("room.join", (p) => handleJoin(io, socket, p).catch(() => {}));
    socket.on("room.leave", () => handleLeave(io, socket).catch(() => {}));
    socket.on("queue.add", (p) => handleAdd(io, socket, p).catch(() => {}));
    socket.on("queue.remove", (p) => handleRemove(io, socket, p).catch(() => {}));
    socket.on("queue.top", (p) => handleTop(io, socket, p).catch(() => {}));
    socket.on("queue.skip", () => handleSkip(io, socket).catch(() => {}));
    socket.on("playback.control", (p) =>
      handleControl(io, socket, p).catch(() => {})
    );
    socket.on("mode.switch", (p) =>
      handleModeSwitch(io, socket, p).catch(() => {})
    );
    // 时钟校准:回显客户端时间戳 + 服务端时间戳
    socket.on("ping", (p) => {
      socket.emit("pong", { t: p?.t ?? null, s: Date.now() });
    });
    socket.on("disconnect", () => handleLeave(io, socket).catch(() => {}));
  });

  // 空房关闭扫描
  setInterval(() => {
    sweepCloseRooms().catch(() => {});
  }, 30_000).unref();
}

async function handleJoin(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const parsed = joinSchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");
  const { roomId, password } = parsed.data;
  const user = socket.data.user;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "open") {
    return err(socket, "ROOM_NOT_FOUND", "房间不存在或已关闭");
  }
  if (room.passwordHash) {
    const key = `join:${user.id}`;
    const limit = joinPasswordLimiter.hit(key);
    if (!limit.allowed) {
      return err(
        socket,
        "RATE_LIMITED",
        `尝试过于频繁,请 ${limit.retryAfterSeconds} 秒后再试`
      );
    }
    if (!password || !verifyPassword(password, room.passwordHash)) {
      return err(socket, "WRONG_PASSWORD", "房间密码错误");
    }
    joinPasswordLimiter.reset(key);
  }
  const count = await state.memberCount(roomId);
  if (count >= room.maxMembers) return err(socket, "ROOM_FULL", "房间已满");

  socket.data.roomId = roomId;
  await socket.join(`room:${roomId}`);
  await state.cancelClose(roomId);

  const first = count === 0;
  const member: MemberInfo = {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    role: user.id === room.ownerId ? "owner" : "listener",
    joinedAt: Date.now(),
  };
  await state.addMember(roomId, member);

  // 首个成员进房:从 PG 重建队列(服务重启场景)
  if (first) await state.rebuildFromDb(roomId);

  // 同步模式:队列有歌但无播放状态(重启/首播)→ 从队首恢复
  if (room.mode === "sync" && (await state.getPlayback(roomId)) === null) {
    const queue = await state.getQueue(roomId);
    if (queue.length > 0) await startSong(io, roomId, queue[0]);
  }

  const playback = room.mode === "sync" ? await state.getPlayback(roomId) : null;
  const members = await state.getMembers(roomId);
  const queue = await state.getQueue(roomId);

  socket.emit("room.snapshot", {
    room: {
      id: room.id,
      name: room.name,
      mode: room.mode,
      ownerId: room.ownerId,
      maxMembers: room.maxMembers,
      hasPassword: !!room.passwordHash,
    },
    members,
    queue,
    playback,
  });
  io.to(`room:${roomId}`).emit("members.changed", { members });
}

async function handleLeave(io: Server, socket: Socket): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return;
  socket.data.roomId = null;
  await socket.leave(`room:${roomId}`);
  await state.removeMember(roomId, user.id);
  const count = await state.memberCount(roomId);
  if (count === 0) {
    await state.scheduleClose(roomId); // 空房 5 分钟后自动关闭
  } else {
    io.to(`room:${roomId}`).emit("members.changed", {
      members: await state.getMembers(roomId),
    });
  }
}

async function handleAdd(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== "open") {
    return err(socket, "ROOM_NOT_FOUND", "房间不存在或已关闭");
  }
  const song = await prisma.song.findUnique({
    where: { id: parsed.data.songId },
  });
  if (!song) return err(socket, "SONG_NOT_FOUND", "歌曲不存在");

  // 同曲不重复点(默认开启)
  const dup = await prisma.queueEntry.findFirst({
    where: {
      roomId,
      songId: song.id,
      status: { in: ["queued", "playing"] },
    },
  });
  if (dup) return err(socket, "DUPLICATE", "这首歌已在队列中");

  const entry = await prisma.queueEntry.create({
    data: { roomId, songId: song.id, requestedBy: user.id },
  });
  const view = {
    id: entry.id,
    song: state.songToView(song),
    requestedBy: { id: user.id, nickname: user.nickname },
    requestedAt: entry.requestedAt.getTime(),
    status: "queued" as const,
  };
  await state.pushEntry(roomId, view);

  // 同步模式且当前无播放 → 自动开播
  if (room.mode === "sync" && (await state.getPlayback(roomId)) === null) {
    await startSong(io, roomId, view);
  } else {
    io.to(`room:${roomId}`).emit("queue.updated", {
      queue: await state.getQueue(roomId),
    });
  }
}

async function handleRemove(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");
  const { entryId } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return err(socket, "ROOM_NOT_FOUND", "房间不存在");
  const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.roomId !== roomId) {
    return err(socket, "NOT_FOUND", "队列条目不存在");
  }
  if (entry.status === "playing") {
    return err(socket, "IS_PLAYING", "正在播放,请使用切歌");
  }
  const isOwner = user.id === room.ownerId;
  if (!isOwner && entry.requestedBy !== user.id) {
    return err(socket, "FORBIDDEN", "只能移除自己点的歌");
  }
  const removed = await state.removeQueuedEntry(roomId, entryId);
  if (removed) {
    await prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: "skipped" },
    });
    io.to(`room:${roomId}`).emit("queue.updated", {
      queue: await state.getQueue(roomId),
    });
  }
}

async function handleTop(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return err(socket, "ROOM_NOT_FOUND", "房间不存在");
  if (user.id !== room.ownerId) return err(socket, "FORBIDDEN", "只有房主可以置顶");

  if (await state.topEntry(roomId, parsed.data.entryId)) {
    io.to(`room:${roomId}`).emit("queue.updated", {
      queue: await state.getQueue(roomId),
    });
  } else {
    err(socket, "NOT_FOUND", "队列条目不存在或正在播放");
  }
}

async function handleSkip(io: Server, socket: Socket): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return err(socket, "ROOM_NOT_FOUND", "房间不存在");
  if (user.id !== room.ownerId) return err(socket, "FORBIDDEN", "只有房主可以切歌");

  if (room.mode === "sync") {
    await advance(io, roomId);
  } else {
    // 自由模式没有"当前播放",切歌 = 移除下一首
    const head = await state.shiftEntry(roomId);
    if (head) {
      await prisma.queueEntry.update({
        where: { id: head.id },
        data: { status: "skipped" },
      });
    }
    io.to(`room:${roomId}`).emit("queue.updated", {
      queue: await state.getQueue(roomId),
    });
  }
}

async function handleControl(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const parsed = controlSchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");
  if (parsed.data.action === "seek" && parsed.data.positionMs === undefined) {
    return err(socket, "BAD_REQUEST", "seek 需要 positionMs");
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return err(socket, "ROOM_NOT_FOUND", "房间不存在");
  if (room.mode !== "sync") {
    return err(socket, "WRONG_MODE", "自由模式下没有全局播放控制");
  }
  if (user.id !== room.ownerId) {
    return err(socket, "FORBIDDEN", "只有房主可以控制播放");
  }

  const { action, positionMs } = parsed.data;
  const ok = await updatePlayback(io, roomId, {
    playing: action === "play" ? true : action === "pause" ? false : undefined,
    positionMs: action === "seek" ? positionMs : undefined,
  });
  if (!ok) return err(socket, "NOT_PLAYING", "当前没有正在播放的歌曲");
}

async function handleModeSwitch(
  io: Server,
  socket: Socket,
  payload: unknown
): Promise<void> {
  const roomId = socket.data.roomId as string | undefined;
  const user = socket.data.user;
  if (!roomId || !user) return err(socket, "NOT_IN_ROOM", "请先加入房间");
  const parsed = modeSchema.safeParse(payload);
  if (!parsed.success) return err(socket, "BAD_REQUEST", "参数错误");
  const { mode } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return err(socket, "ROOM_NOT_FOUND", "房间不存在");
  if (user.id !== room.ownerId) return err(socket, "FORBIDDEN", "只有房主可以切换模式");
  if (room.mode === mode) return;

  await prisma.room.update({ where: { id: roomId }, data: { mode } });
  if (mode === "free") {
    await stopPlayback(io, roomId); // 同步→自由:停全局播放
  } else {
    // 自由→同步:队列有歌则从头开播
    const playback = await state.getPlayback(roomId);
    if (!playback) {
      const queue = await state.getQueue(roomId);
      if (queue.length > 0) await startSong(io, roomId, queue[0]);
    }
  }
  io.to(`room:${roomId}`).emit("mode.changed", { mode });
}
