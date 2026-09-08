import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import {
  neteaseCovers,
  neteaseSearch,
  neteaseSongUrl,
} from "../services/netease.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
});

/** 统一歌曲视图:网易云与本地曲库对外同构 */
function toSongView(song: {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  coverUrl: string | null;
  source: string;
  sourceId: string | null;
}) {
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

export function songRoutes(app: FastifyInstance) {
  // 聚合搜索:本地曲库 + 网易云(网易云结果顺手缓存入库)
  app.get("/api/songs/search", async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: "搜索词需为 1-50 字符" });
    }
    const { q } = parsed.data;

    const local = await prisma.song.findMany({
      where: {
        source: "local",
        OR: [{ title: { contains: q } }, { artist: { contains: q } }],
      },
      take: 10,
    });

    let netease: ReturnType<typeof toSongView>[] = [];
    try {
      const raws = await neteaseSearch(q, 20);
      const covers = await neteaseCovers(raws.map((r) => r.id));
      // 搜索到的歌缓存入库(唯一键 source+sourceId 去重)
      await prisma.song.createMany({
        data: raws.map((r) => ({
          title: r.name,
          artist: r.artists?.[0]?.name ?? "未知歌手",
          album: r.album?.name ?? null,
          durationMs: r.duration ?? 0,
          coverUrl: covers.get(r.id) ?? null,
          source: "netease",
          sourceId: String(r.id),
        })),
        skipDuplicates: true,
      });
      const rows = await prisma.song.findMany({
        where: {
          source: "netease",
          sourceId: { in: raws.map((r) => String(r.id)) },
        },
      });
      const bySourceId = new Map(rows.map((r) => [r.sourceId, r]));
      netease = raws
        .map((r) => {
          const row = bySourceId.get(String(r.id));
          return row ? toSongView(row) : null;
        })
        .filter((s): s is ReturnType<typeof toSongView> => s !== null);
    } catch (err) {
      // 网易云 API 故障不阻塞本地曲库搜索
      req.log.error(err, "netease search failed");
    }

    return { netease, local: local.map(toSongView) };
  });

  // 获取可播放 URL:网易云实时拉取(URL 有时效不缓存);本地歌曲走 MinIO(上传功能完成后接入)
  app.get(
    "/api/songs/:id/url",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const song = await prisma.song.findUnique({ where: { id } });
      if (!song) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "歌曲不存在" });
      }
      if (song.source === "netease") {
        if (!song.sourceId) {
          return reply.code(404).send({ code: "NOT_FOUND", message: "歌曲信息缺失" });
        }
        try {
          const url = await neteaseSongUrl(Number(song.sourceId));
          if (!url) {
            return reply
              .code(403)
              .send({ code: "NO_PLAYABLE_URL", message: "该歌曲暂无播放版权" });
          }
          return { url };
        } catch (err) {
          req.log.error(err, "netease song url failed");
          return reply
            .code(502)
            .send({ code: "UPSTREAM_ERROR", message: "音乐源暂不可用,请稍后重试" });
        }
      }
      return reply
        .code(501)
        .send({ code: "NOT_IMPLEMENTED", message: "本地歌曲播放待上传功能完成后开放" });
    }
  );
}
