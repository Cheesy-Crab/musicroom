import type { Server } from "socket.io";
import { prisma } from "../prisma.js";
import {
  clearRoomState,
  dueCloses,
  getPlayback,
  getQueue,
  memberCount,
  setPlayback,
  shiftEntry,
  updateEntryStatus,
} from "./state.js";
import type { PlaybackState, QueueEntryView } from "./types.js";

// 每个房间的自动切歌定时器(纯内存,服务重启后由 rebuildFromDb + join 恢复)
const timers = new Map<string, NodeJS.Timeout>();

function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function broadcastPlayback(
  io: Server,
  roomId: string,
  state: PlaybackState | null
): void {
  io.to(roomChannel(roomId)).emit("playback.state", state);
}

/** 开始播放某条目(同步模式):标记 PG、写 Redis 状态、排定时器、广播 */
export async function startSong(
  io: Server,
  roomId: string,
  entry: QueueEntryView,
  positionMs = 0
): Promise<void> {
  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: "playing" },
  });
  await updateEntryStatus(roomId, entry.id, "playing");
  const state: PlaybackState = {
    entryId: entry.id,
    songId: entry.song.id,
    song: entry.song,
    durationMs: entry.song.durationMs,
    positionMs,
    playing: true,
    seq: Date.now(),
    ts: Date.now(),
  };
  await setPlayback(roomId, state);
  scheduleTimer(io, roomId, entry.song.durationMs - positionMs);
  broadcastPlayback(io, roomId, state);
  io.to(roomChannel(roomId)).emit("playback.changed", { songId: entry.song.id });
  io.to(roomChannel(roomId)).emit("queue.updated", {
    queue: await getQueue(roomId),
  });
}

function scheduleTimer(io: Server, roomId: string, remainingMs: number): void {
  const old = timers.get(roomId);
  if (old) clearTimeout(old);
  const t = setTimeout(() => {
    advance(io, roomId).catch(() => {});
  }, Math.max(remainingMs, 1000));
  timers.set(roomId, t);
}

/** 推进队列:当前歌完结/切歌 → 记历史 → 播下一首或清空播放状态 */
export async function advance(io: Server, roomId: string): Promise<void> {
  timers.delete(roomId);
  const current = await getPlayback(roomId);
  if (current) {
    await prisma.queueEntry.update({
      where: { id: current.entryId },
      data: { status: "played", playedAt: new Date() },
    });
    await prisma.playHistory.create({
      data: { roomId, songId: current.songId },
    });
  }
  // 同步模式不变量:队列队首 = 正在播放的条目。
  // 弹出刚播完的队首,新队首(下一首)保留在队列中直接开播。
  await shiftEntry(roomId);
  const queue = await getQueue(roomId);
  const next = queue[0] ?? null;
  if (next) {
    await startSong(io, roomId, next);
  } else {
    await setPlayback(roomId, null);
    broadcastPlayback(io, roomId, null);
  }
}

/** 暂停/播放/seek:更新状态并重排定时器 */
export async function updatePlayback(
  io: Server,
  roomId: string,
  patch: { positionMs?: number; playing?: boolean }
): Promise<boolean> {
  const cur = await getPlayback(roomId);
  if (!cur) return false;
  const next: PlaybackState = {
    ...cur,
    positionMs: patch.positionMs ?? cur.positionMs,
    playing: patch.playing ?? cur.playing,
    seq: cur.seq + 1,
    ts: Date.now(),
  };
  await setPlayback(roomId, next);
  if (next.playing) {
    scheduleTimer(io, roomId, next.durationMs - next.positionMs);
  } else {
    const t = timers.get(roomId);
    if (t) {
      clearTimeout(t);
      timers.delete(roomId);
    }
  }
  broadcastPlayback(io, roomId, next);
  return true;
}

/** 停止播放并清除状态(切到自由模式用) */
export async function stopPlayback(io: Server, roomId: string): Promise<void> {
  const t = timers.get(roomId);
  if (t) {
    clearTimeout(t);
    timers.delete(roomId);
  }
  await setPlayback(roomId, null);
  broadcastPlayback(io, roomId, null);
}

/** 空房 5 分钟未回人 → 关闭房间(周期性扫描,30s 一次) */
export async function sweepCloseRooms(): Promise<void> {
  const due = await dueCloses(Date.now());
  for (const roomId of due) {
    if ((await memberCount(roomId)) > 0) continue; // 有人回来了,保留
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "closed", closedAt: new Date() },
    });
    await clearRoomState(roomId);
  }
}
