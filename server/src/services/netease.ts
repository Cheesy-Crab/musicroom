import { config } from "../config.js";

// 网易云 API 代理(NeteaseCloudMusicApi)的封装。
// 注意:播放 URL 有有效期且可能绑 IP,必须播放时实时拉取,绝不缓存。

interface NeteaseSongRaw {
  id: number;
  name: string;
  artists?: { name: string }[];
  album?: { name?: string };
  duration?: number;
}

/** 关键词搜索(type=1 单曲) */
export async function neteaseSearch(
  keywords: string,
  limit = 20
): Promise<NeteaseSongRaw[]> {
  const res = await fetch(
    `${config.neteaseApiUrl}/search?keywords=${encodeURIComponent(keywords)}&limit=${limit}&type=1`
  );
  if (!res.ok) throw new Error(`netease search failed: ${res.status}`);
  const data = (await res.json()) as { result?: { songs?: NeteaseSongRaw[] } };
  return data.result?.songs ?? [];
}

/** 批量取封面(搜索结果里没有 picUrl,需要 song/detail 补) */
export async function neteaseCovers(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(
    `${config.neteaseApiUrl}/song/detail?ids=${ids.join(",")}`
  );
  if (!res.ok) throw new Error(`netease detail failed: ${res.status}`);
  const data = (await res.json()) as {
    songs?: { id: number; al?: { picUrl?: string } }[];
  };
  const map = new Map<number, string>();
  for (const s of data.songs ?? []) {
    if (s.al?.picUrl) map.set(s.id, s.al.picUrl);
  }
  return map;
}

/** 实时拉取播放 URL;无版权/失败返回 null。format 供客户端确定解码器(URL 无扩展名) */
export async function neteaseSongUrl(
  id: number
): Promise<{ url: string; format: string } | null> {
  const res = await fetch(
    `${config.neteaseApiUrl}/song/url/v1?id=${id}&level=standard`
  );
  if (!res.ok) throw new Error(`netease url failed: ${res.status}`);
  const data = (await res.json()) as {
    data?: { url: string | null; type?: string | null }[];
  };
  const item = data.data?.[0];
  if (!item?.url) return null;
  return { url: item.url, format: (item.type ?? "mp3").toLowerCase() };
}
