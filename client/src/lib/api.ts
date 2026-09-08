// 统一 API 前缀:与部署子路径一致(线上 https://domain.com/music-room/api)
// 开发环境由 Vite 代理转发,剥前缀后到达后端 /api/*(与 Caddy 行为一致)
export const API_BASE = import.meta.env.BASE_URL + "api";
export const WS_PATH = import.meta.env.BASE_URL + "socket.io";

export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("musicroom_token");
  const { headers, ...rest } = opts;
  const res = await fetch(API_BASE + path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
  });
  return res.json();
}
