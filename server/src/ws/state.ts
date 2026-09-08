import { redis } from "../redis.js";
import { prisma } from "../prisma.js";
import type {
  MemberInfo,
  PlaybackState,
  QueueEntryView,
  SongView,
} from "./types.js";

// Redis 键约定:房间热状态全部带 TTL/惰性清理,PG 是唯一持久层
const membersKey = (roomId: string) => `room:${roomId}:members`;
const queueKey = (roomId: string) => `room:${roomId}:queue`;
const queueEntriesKey = (roomId: string) => `room:${roomId}:queue:entries`;
const playbackKey = (roomId: string) => `room:${roomId}:playback`;
const PENDING_CLOSE_ZSET = "rooms:pendingClose"; // score = 计划关闭时刻

// ---------- 成员 ----------

export async function getMembers(roomId: string): Promise<MemberInfo[]> {
  const map = await redis.hgetall(membersKey(roomId));
  return Object.values(map).map((v) => JSON.parse(v) as MemberInfo);
}

export async function addMember(roomId: string, m: MemberInfo): Promise<void> {
  await redis.hset(membersKey(roomId), m.id, JSON.stringify(m));
}

export async function removeMember(roomId: string, userId: string): Promise<void> {
  await redis.hdel(membersKey(roomId), userId);
}

export async function memberCount(roomId: string): Promise<number> {
  return redis.hlen(membersKey(roomId));
}

// ---------- 队列 ----------

export async function getQueue(roomId: string): Promise<QueueEntryView[]> {
  const ids = await redis.lrange(queueKey(roomId), 0, -1);
  if (ids.length === 0) return [];
  const raws = await redis.hmget(queueEntriesKey(roomId), ...ids);
  const result: QueueEntryView[] = [];
  ids.forEach((id, i) => {
    if (raws[i]) result.push(JSON.parse(raws[i]) as QueueEntryView);
  });
  return result;
}

export async function pushEntry(roomId: string, e: QueueEntryView): Promise<void> {
  await redis
    .multi()
    .rpush(queueKey(roomId), e.id)
    .hset(queueEntriesKey(roomId), e.id, JSON.stringify(e))
    .exec();
}

/** 弹出队首(播放完/切歌用),返回被弹出的条目 */
export async function shiftEntry(roomId: string): Promise<QueueEntryView | null> {
  const id = await redis.lpop(queueKey(roomId));
  if (!id) return null;
  const raw = await redis.hget(queueEntriesKey(roomId), id);
  await redis.hdel(queueEntriesKey(roomId), id);
  return raw ? (JSON.parse(raw) as QueueEntryView) : null;
}

/** 移除排队中的条目(非队首),返回是否移除成功 */
export async function removeQueuedEntry(
  roomId: string,
  entryId: string
): Promise<boolean> {
  const removed = await redis.lrem(queueKey(roomId), 0, entryId);
  await redis.hdel(queueEntriesKey(roomId), entryId);
  return removed > 0;
}

/** 顶歌:移到当前播放之后(列表索引 1)。队首(正在播放)不可顶。 */
export async function topEntry(roomId: string, entryId: string): Promise<boolean> {
  const head = await redis.lindex(queueKey(roomId), 0);
  if (head === entryId) return false; // 正在播放,置顶无意义
  const removed = await redis.lrem(queueKey(roomId), 0, entryId);
  if (removed === 0) return false;
  if (head) {
    await redis.linsert(queueKey(roomId), "AFTER", head, entryId);
  } else {
    await redis.rpush(queueKey(roomId), entryId);
  }
  return true;
}

/** 更新队列哈希中条目的状态(queued/playing) */
export async function updateEntryStatus(
  roomId: string,
  entryId: string,
  status: "queued" | "playing"
): Promise<void> {
  const raw = await redis.hget(queueEntriesKey(roomId), entryId);
  if (!raw) return;
  const e = JSON.parse(raw) as QueueEntryView;
  e.status = status;
  await redis.hset(queueEntriesKey(roomId), entryId, JSON.stringify(e));
}

// ---------- 播放状态 ----------

export async function getPlayback(roomId: string): Promise<PlaybackState | null> {
  const raw = await redis.get(playbackKey(roomId));
  return raw ? (JSON.parse(raw) as PlaybackState) : null;
}

export async function setPlayback(
  roomId: string,
  s: PlaybackState | null
): Promise<void> {
  if (s) await redis.set(playbackKey(roomId), JSON.stringify(s));
  else await redis.del(playbackKey(roomId));
}

// ---------- 房间生命周期 ----------

/** 空房后 5 分钟关闭(grace period) */
export async function scheduleClose(roomId: string): Promise<void> {
  await redis.zadd(PENDING_CLOSE_ZSET, Date.now() + 5 * 60_000, roomId);
}

export async function cancelClose(roomId: string): Promise<void> {
  await redis.zrem(PENDING_CLOSE_ZSET, roomId);
}

export async function dueCloses(now: number): Promise<string[]> {
  return redis.zrangebyscore(PENDING_CLOSE_ZSET, "-inf", now);
}

export async function clearRoomState(roomId: string): Promise<void> {
  await redis.del(
    membersKey(roomId),
    queueKey(roomId),
    queueEntriesKey(roomId),
    playbackKey(roomId)
  );
  await redis.zrem(PENDING_CLOSE_ZSET, roomId);
}

// ---------- 工具 ----------

export function songToView(song: {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  coverUrl: string | null;
  source: string;
  sourceId: string | null;
}): SongView {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationMs: song.durationMs,
    coverUrl: song.coverUrl,
    source: song.source,
    sourceId: song.sourceId,
  };
}

/** 服务重启后首个成员进房时,从 PG 重建队列热数据 */
export async function rebuildFromDb(roomId: string): Promise<void> {
  const entries = await prisma.queueEntry.findMany({
    where: { roomId, status: { in: ["queued", "playing"] } },
    include: {
      song: true,
      requester: { select: { id: true, nickname: true } },
    },
    orderBy: { requestedAt: "asc" },
  });
  for (const e of entries) {
    await pushEntry(roomId, {
      id: e.id,
      song: songToView(e.song),
      requestedBy: { id: e.requester.id, nickname: e.requester.nickname },
      requestedAt: e.requestedAt.getTime(),
      status: "queued",
    });
  }
}
