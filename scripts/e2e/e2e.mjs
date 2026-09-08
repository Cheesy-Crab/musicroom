// 端到端验证:两个真实浏览器窗口进同一房间,验证同步播放与进度对齐
// 依赖: 后端(:3000)+ vite(:5173)+ 依赖容器已启动
import { chromium } from "playwright";
import { io } from "socket.io-client";

const API = process.env.E2E_API ?? "http://localhost:3000";
const VITE = process.env.E2E_VITE ?? "http://localhost:5173";
const WS = process.env.E2E_WS ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(API + path, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
  return res.json();
}

// ---- 种子数据:房主 A、听众 B、房间、两首歌(第一首自动开播)
async function seed() {
  const gA = await api("/api/auth/guest", { method: "POST", body: JSON.stringify({ nickname: "E2E房主" }) });
  const gB = await api("/api/auth/guest", { method: "POST", body: JSON.stringify({ nickname: "E2E听众" }) });
  const room = await api("/api/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${gA.token}` },
    body: JSON.stringify({ name: "E2E验证房" }),
  });
  const search = await api("/api/songs/search?q=晴天");
  const songs = search.netease.slice(0, 2);

  const sock = io(WS, { auth: { token: gA.token }, transports: ["websocket"] });
  await new Promise((r) => sock.on("connect", r));
  sock.emit("room.join", { roomId: room.room.id });
  await new Promise((r) => sock.once("room.snapshot", r));
  sock.emit("queue.add", { songId: songs[0].id });
  const firstState = await new Promise((r) => sock.once("playback.state", r));
  sock.emit("queue.add", { songId: songs[1].id });
  await new Promise((r) => sock.once("queue.updated", r));
  sock.disconnect();

  return {
    roomId: room.room.id,
    tokenA: gA.token,
    tokenB: gB.token,
    song1Title: songs[0].title,
    song2Title: songs[1].title,
    playingEntryId: firstState.entryId,
  };
}

const seeded = await seed();
console.log(`种子完成: 房间=${seeded.roomId}, 播放中=${seeded.song1Title}`);

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function openWindow(token, name) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((t) => localStorage.setItem("musicroom_token", t), token);
  const page = await ctx.newPage();
  await page.goto(`${VITE}/music-room/room/${seeded.roomId}`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

const rangeValue = (page) =>
  page.locator('input[type="range"]').first().inputValue().then(Number);

try {
  const A = await openWindow(seeded.tokenA, "A(房主)");
  const B = await openWindow(seeded.tokenB, "B(听众)");

  // 1. 两窗口都显示正在播放的歌名
  await A.page.waitForSelector("text=播放中", { timeout: 15000 });
  await B.page.waitForSelector("text=播放中", { timeout: 15000 });
  const titleA = await A.page.locator("div.text-xl.font-bold").first().innerText();
  const titleB = await B.page.locator("div.text-xl.font-bold").first().innerText();
  check("A 显示正在播放歌曲", titleA === seeded.song1Title, `实际=${titleA}`);
  check("B 显示正在播放歌曲", titleB === seeded.song1Title, `实际=${titleB}`);

  // 2. 等 4 秒,两窗口进度都在走且误差 < 2.5s
  await sleep(4000);
  const posA1 = await rangeValue(A.page);
  const posB1 = await rangeValue(B.page);
  check("A 进度在推进", posA1 > 3000, `posA=${posA1}`);
  check("B 进度在推进", posB1 > 3000, `posB=${posB1}`);
  check("两窗口进度对齐(误差<2.5s)", Math.abs(posA1 - posB1) < 2500, `Δ=${Math.abs(posA1 - posB1)}`);

  // 3. 房主经 WS seek 到 30s,两个窗口都要跟过去
  const sock = io(WS, { auth: { token: seeded.tokenA }, transports: ["websocket"] });
  await new Promise((r) => sock.on("connect", r));
  sock.emit("room.join", { roomId: seeded.roomId });
  await new Promise((r) => sock.once("room.snapshot", r));
  sock.emit("playback.control", { action: "seek", positionMs: 30000 });
  await new Promise((r) => sock.once("playback.state", (s) => s.positionMs === 30000 && r()));
  await sleep(4000);
  const posA2 = await rangeValue(A.page);
  const posB2 = await rangeValue(B.page);
  check("seek 后 A 进度 ≈ 30s+", posA2 > 30000 && posA2 < 42000, `posA=${posA2}`);
  check("seek 后 B 进度 ≈ 30s+", posB2 > 30000 && posB2 < 42000, `posB=${posB2}`);
  check("seek 后两窗口仍然对齐", Math.abs(posA2 - posB2) < 2500, `Δ=${Math.abs(posA2 - posB2)}`);
  sock.disconnect();

  // 4. B 的队列显示 2 首歌,第一首带「播放中」徽标
  const badgeCount = await B.page.locator("text=播放中").count();
  check("B 队列有播放中徽标", badgeCount >= 1);

  // 5. 截图留档
  await A.page.screenshot({ path: "/tmp/e2e/window-A.png" });
  await B.page.screenshot({ path: "/tmp/e2e/window-B.png" });

  await A.ctx.close();
  await B.ctx.close();
} finally {
  await browser.close();
}

console.log(`\n端到端结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
