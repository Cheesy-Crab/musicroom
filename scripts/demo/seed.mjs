// 演示数据:创建「欢迎体验」房间并点 3 首可播放的歌(同步模式,进房即听)
// 用法: node seed.mjs [入口地址,默认 http://localhost:8080/music-room]
import { io } from "socket.io-client";

// 入口:仅主机部分(如 http://localhost:8080),子路径 /music-room 由脚本拼接
const HOST = process.argv[2] ?? "http://localhost:8080";
const API = `${HOST}/music-room/api`;
const WS_PATH = "/music-room/socket.io";

async function api(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(API + path, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
  return res.json();
}

async function main() {
  // 1. 游客(房主)
  const guest = await api("/auth/guest", {
    method: "POST",
    body: JSON.stringify({ nickname: "演示房主" }),
  });

  // 2. 建房间
  const roomRes = await api("/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${guest.token}` },
    body: JSON.stringify({ name: "🎵 欢迎体验 · 点歌听歌" }),
  });
  const roomId = roomRes.room.id;

  // 3. 搜索并挑 3 首有播放版权的歌
  const search = await api("/songs/search?q=周杰伦");
  const picked = [];
  for (const song of search.netease ?? []) {
    if (picked.length >= 3) break;
    const urlRes = await api(`/songs/${song.id}/url`, {
      headers: { Authorization: `Bearer ${guest.token}` },
    });
    if (urlRes.url) picked.push(song);
  }
  if (picked.length === 0) {
    console.error("没有找到可播放的歌曲,演示数据未创建");
    process.exit(1);
  }

  // 4. WS 进房并点歌(第一首自动开播)
  const sock = io(HOST, {
    auth: { token: guest.token },
    path: WS_PATH,
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    sock.on("connect", resolve);
    sock.on("connect_error", (e) => reject(new Error(`WS 连接失败: ${e.message}`)));
  });
  sock.emit("room.join", { roomId });
  await new Promise((r) => sock.once("room.snapshot", r));
  for (const song of picked) {
    sock.emit("queue.add", { songId: song.id });
    await new Promise((r) => sock.once("queue.updated", r));
  }
  sock.disconnect();

  console.log(`演示房间已就绪:`);
  console.log(`  入口: ${HOST}/music-room/room/${roomId}`);
  console.log(`  队列: ${picked.map((s) => s.title).join(" / ")}`);
}

main().catch((e) => {
  console.error("种子脚本失败:", e.message);
  process.exit(1);
});
