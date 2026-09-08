# 在线点播室 · 方案设计

## 1. 需求确认

| 维度 | 决策 |
|---|---|
| 音乐来源 | 第三方音乐API(网易云) + 自建上传曲库 结合 |
| 播放模式 | 房主可切换「同步模式」(全房同步收听) /「自由模式」(共享歌单各自播) |
| 终端 | 纯 Web(响应式, 手机 + 桌面) |
| 用户系统 | 游客直接使用 + 可选注册登录 |

## 2. 总体架构

```
                        ┌──────────────────────────────┐
                        │        浏览器 (React SPA)      │
                        │  大厅 · 房间页 · 点歌台 · 播放器 │
                        └──────┬──────────────┬────────┘
                      REST/HTTPS│              │ WebSocket (socket.io)
                                ▼              ▼
┌──────────────┐  代理调用  ┌───────────────────────────────┐
│ NeteaseCloud  │◄────────►│       后端 (Node.js + TS)       │
│ MusicApi 容器 │ 搜索/播放URL│  REST API · WS 房间服务        │
│ (开源代理)     │           │  播放状态机 · 队列管理 · 权限    │
└──────────────┘           └────┬────────┬─────────┬───────┘
                                │        │         │
                                ▼        ▼         ▼
                          PostgreSQL    Redis     MinIO
                          持久数据    房间/队列   自建曲库
                          用户/房间   热状态     音频文件
                          歌曲/记录   (TTL)
```

## 3. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | React + TypeScript + Vite + Zustand + howler.js + TailwindCSS | howler 统一处理音频(播/停/seek); Zustand 轻量状态; 响应式一套代码 |
| 实时通信 | socket.io | 自动重连、房间抽象、心跳降级, 省去自己写协议层 |
| 后端 | Node.js + TypeScript + Fastify + Prisma | 前后端同语言; Fastify 轻量高性能; Prisma 类型安全 |
| 数据库 | PostgreSQL | 用户/房间/歌曲/队列记录等持久数据 |
| 缓存/状态 | Redis | 房间热状态、在线成员、播放状态、队列(带 TTL), 游客会话 |
| 音乐API | [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) (Docker 自部署) | 成熟开源代理, 提供搜索/歌曲URL/歌词 |
| 文件存储 | MinIO(生产) / 本地磁盘(开发) | 上传音频, 原生支持 HTTP Range 流式播放 |
| 反代/HTTPS | Caddy (Docker) | 自动签发+续期 Let's Encrypt 证书, 原生支持 WebSocket, 一个配置文件搞定静态文件+反代 |
| 部署 | Docker Compose | 一条命令拉起 全部服务, 前后端同域无跨域问题 |

## 4. 核心数据模型 (PostgreSQL)

```
users          id, nickname, avatar_url, email?, password_hash?, auth_provider?,
               is_guest, created_at
               -- 游客和注册用户同表, 登录时升级绑定

rooms          id, name, cover_url, owner_id → users, mode('sync'|'free'),
               password_hash?, max_members, status('open'|'closed'),
               created_at, closed_at

songs          id, title, artist, album, duration_ms, cover_url,
               source('netease'|'local'), source_id?/file_key?,
               lyric?, created_by?, created_at
               -- 网易云歌曲按需缓存进来; 本地歌曲上传时创建

queue_entries  id, room_id → rooms, song_id → songs, requested_by → users,
               status('queued'|'playing'|'played'|'skipped'),
               requested_at, played_at
               -- 队列是热数据: Redis 为运行时视图, PG 为落盘记录

play_history   id, room_id, song_id, played_at   -- 房间点播历史
```

## 5. 实时协议 (socket.io)

房间命名空间: `socket.join(room:<id>)`, 服务端向房间广播。

**Client → Server**

| 事件 | 载荷 | 权限 |
|---|---|---|
| `room.join` | `{ roomId, password? }` | 所有人 |
| `room.leave` | — | 所有人 |
| `queue.add` | `{ songId }` | 所有人 |
| `queue.remove` | `{ entryId }` | 点歌人本人 / 房主 / DJ |
| `queue.top` | `{ entryId }` | 房主 / DJ |
| `queue.skip` | — | 房主 / DJ |
| `playback.control` | `{ action:'play'|'pause'|'seek', positionMs? }` | 房主 / DJ(仅同步模式) |
| `mode.switch` | `{ mode }` | 房主 |
| `ping` | `{ t }` | 时钟校准 |

**Server → Client**

| 事件 | 载荷 |
|---|---|
| `room.snapshot` | `{ room, members[], queue[], playback }` (进房全量快照) |
| `queue.updated` | `{ queue[] }` |
| `playback.state` | `{ songId, positionMs, playing, seq, ts }` |
| `playback.changed` | `{ songId }` (切歌通知) |
| `members.changed` | `{ members[] }` |
| `mode.changed` | `{ mode }` |
| `pong` | `{ t }` |
| `error` | `{ code, message }` |

## 6. 同步播放方案(核心难点)

**原则: 服务端是时间权威。**

- 服务端维护播放状态 `{ songId, positionMs, playing, seq, ts }`, 每次变化广播并携带服务端时间戳 `ts`。
- **时钟校准**: 客户端连接时 ping/pong 测 RTT, 计算 `offset = serverTime - localTime`。
- **进房定位**: 收到状态后计算 `currentPos = positionMs + (playing ? (serverNow - ts) : 0)`, seek 后播放; 中途进房的人自然对齐。
- **漂移修正**: 每 10s 校准一次, 偏差 > 1.5s 时 seek 修正(或短暂调整 playbackRate 平滑修正)。
- **自动切歌**: 服务端 `setTimeout(duration - position)` 触发队列推进, 广播 `playback.changed`。
- **控制权**: 同步模式下只有房主/DJ 能 暂停/播放/seek/切歌; 自由模式下服务端只维护队列, 播放完全本地。

**音乐 URL 时效问题**: 网易云返回的播放 URL 有有效期且可能绑定 IP, 必须**播放时实时拉取**(服务端在切歌时取好 URL 放进 `playback.changed` 载荷, 失败自动重试), 绝不能在点歌时缓存旧 URL。

## 7. 自建曲库管线

```
上传(multipart) → 校验(mime/大小/ffprobe 探测时长) → 存 MinIO
→ 解析元数据(文件名/ID3, 可手动编辑) → 写入 songs 表(source='local')
→ 搜索: PG ILIKE + 按需 pg_trgm 索引
```

播放本地歌曲走 MinIO/后端的 **HTTP Range 流式接口**, 支持拖动进度条。

## 8. REST API 概览

```
POST   /api/auth/guest           游客创建(返回 JWT)
POST   /api/auth/login           登录(可选, 绑定游客数据)
POST   /api/auth/register        注册

POST   /api/rooms                创建房间
GET    /api/rooms                大厅房间列表(可搜索)
GET    /api/rooms/:id            房间详情

GET    /api/songs/search?q=      聚合搜索(网易云 + 本地库)
GET    /api/songs/:id/url        获取可播放 URL(实时拉取, 仅房间成员)
GET    /api/songs/:id/lyric      歌词

POST   /api/uploads              上传音频(登录用户)
GET    /api/stream/:songId       Range 流式播放(本地歌曲)
```

## 9. 房间与队列规则

- 创建者即房主; 可设密码、最大人数; 房主可任命 DJ。
- 房主离开后空房 5 分钟自动关闭(Redis TTL + 定时任务落库)。
- 点歌: 任何人可点; 房主/DJ 可置顶/切歌/移除任意歌曲; 普通用户只能移除自己点的。
- 去重: 房间可开关「同曲不重复点」(默认开)。
- 房间内在线状态: Redis 成员 TTL 心跳 15s。

## 10. 前端页面结构

```
大厅 /                    房间 /room/:id
├─ 房间列表(搜索/筛选)      ├─ 播放器(封面/歌词/进度条)
└─ 创建房间弹窗            ├─ 点歌台弹窗: 搜索 + 结果(网易云/本地 tab) + 一键点歌
                          ├─ 队列面板(置顶/移除/状态徽标)
                          ├─ 成员面板(房主/DJ/游客 角色标识)
                          └─ 聊天(可后续加)
移动端: 底部迷你播放器 + 队列全屏抽屉
```

## 11. 里程碑

| 阶段 | 内容 |
|---|---|
| **M1 MVP** | 游客建房/进房、网易云搜索点歌、队列增删、同步播放+房主控制、自由模式切换、自动切歌、**部署上线到自己的域名** |
| **M2** | 注册登录(绑定游客数据)、音频上传+自建曲库、歌词显示、房间聊天、密码房 |
| **M3** | 大厅房间发现、播放历史/收藏、DJ 任命、移动端体验打磨、水平扩容(Redis adapter) |

## 12. 风险与应对

| 风险 | 应对 |
|---|---|
| 网易云非官方接口不稳定/版权合规 | 仅供学习使用; 自建曲库兜底; 播放 URL 实时拉取+重试 |
| 音频流跨域/防盗链 | 统一走后端代理或校验; 本地歌曲走自有 Range 接口 |
| 多人同步受网络抖动影响 | 时钟偏移校准 + 漂移阈值修正 |
| 长连接水平扩容 | MVP 单实例即可; 后续 socket.io Redis adapter + 粘性会话 |

## 13. 目录结构(建议)

```
musicroom/
├─ client/               # React 前端
├─ server/               # Fastify 后端
│  ├─ src/routes/        # REST
│  ├─ src/ws/            # socket.io 事件
│  ├─ src/services/      # 房间/队列/播放状态机/音乐源
│  └─ prisma/            # 数据模型
├─ docker-compose.yml    # 本地开发环境(PG/Redis/MinIO/音乐API)
├─ docker-compose.prod.yml  # 生产部署(caddy+后端+依赖, 多阶段构建)
├─ Caddyfile             # 域名/TLS/反代配置
├─ .env.example          # 环境变量模板(域名/密钥/密码)
├─ deploy.sh             # 一键部署脚本
└─ DESIGN.md
```

---

## 14. 部署方案(域名 + 服务器)

### 14.1 生产拓扑

```
                      Internet
                         │
            ┌────────────▼─────────────┐
            │      域名 domain.com      │  DNS A 记录 → 服务器公网 IP
            └────────────┬─────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │        服务器 (单台 VPS, Docker Compose)           │
   │                                                  │
   │  Caddy :80/:443 (唯一对外暴露)                      │
   │   ├─ /music-room/            → 前端静态文件         │
   │   ├─ /music-room/api/*       → backend:3000      │
   │   └─ /music-room/socket.io/* → backend:3000 (WS) │
   │       (handle_path 自动剥掉 /music-room 前缀)       │
   │                                                  │
   │  内网 docker network (完全不对外暴露):              │
   │  backend · postgres · redis · minio              │
   │  · netease-api                                   │
   └──────────────────────────────────────────────────┘
```

### 14.2 域名与 DNS

- 域名控制台添加 A 记录:`domain.com`(根域名 `@`)→ 服务器公网 IP,`dig` 验证生效。
- 点播室挂在子路径 **`/music-room`** 下,与主站同域同源:页面从 `https://domain.com/music-room/` 加载,`/music-room/api`、`/music-room/socket.io` 同源,无跨域问题。
- 若 `domain.com` 已在跑主站(nginx 或 Caddy 均可):把 14.10 的 `handle_path`/`location` 块合并进现有配置即可,容器拓扑不变。
- 前端静态文件由 Caddy 直接托管,不需要单独的 nginx 容器。

### 14.3 HTTPS

- Caddy 自动向 Let's Encrypt 申请并续期证书,零配置(前提:域名已解析、80/443 已放行)。
- 全站 HTTPS,浏览器里的 WebSocket 自动升级为 `wss://`,socket.io 无需额外配置。

### 14.4 安全加固

- ufw 防火墙只放行 22 / 80 / 443。
- PostgreSQL / Redis / MinIO / 网易云API 只监听 docker 内网,**不映射宿主机端口**。
- 所有密钥(`JWT_SECRET`、数据库密码、MinIO 密钥)放 `.env`,加入 `.gitignore`。
- MinIO 桶默认私有,本地歌曲通过后端 Range 接口代理流出,不直接暴露桶。

### 14.5 部署流程

```
本地开发 → git push 到 GitHub/Gitee → SSH 到服务器 git pull → ./deploy.sh
deploy.sh = docker compose -f docker-compose.prod.yml build && up -d
```

- 前端用 Dockerfile 多阶段构建:build 阶段产出静态文件,Caddy 直接托管。
- MVP 阶段手动部署即可;后续可升级 GitHub Actions 自动 SSH 部署(CI/CD)。

### 14.6 数据备份

| 数据 | 方案 |
|---|---|
| PostgreSQL | cron 每天 `pg_dump`,备份文件可再同步到对象存储 |
| MinIO 音频 | `mc mirror` 增量同步 |
| Redis | 纯热数据,不需要备份 |

### 14.7 服务器配置建议

- 最低 1C2G(内存偏紧),建议 **2C4G**;系统 Ubuntu 22.04 / Debian 12。
- 带宽估算:30 人同步收听 ≈ 128kbps × 30 ≈ 4 Mbps,普通 VPS 带宽够用;流量大了再把音频改走 CDN/对象存储。

### 14.8 上线清单(按顺序)

1. 域名解析 A 记录 → 服务器 IP,`dig` 验证
2. 服务器安装 Docker + Compose 插件,ufw 放行 22/80/443
3. **大陆服务器:先启动 ICP 备案**(见 14.9,可并行开发)
4. 配置 `.env`(域名、密钥)、写 `Caddyfile`
5. 代码推到远端仓库,服务器 clone
6. `./deploy.sh` 构建启动
7. 浏览器访问 `https://domain.com/music-room/`,验证页面加载 + WS 连接正常
8. 配置备份 cron

### 14.9 重要提醒

- **ICP 备案**:域名解析到大陆机房必须完成备案,否则 80/443 被运营商阻断,网站无法通过域名访问。备案一般需 1~3 周,建议**今天就去启动备案流程**(网站主体信息等备案通过后再上线);不想备案可改用香港/海外服务器,即开即用。
- **版权合规**:网易云非官方接口仅供学习自用;公开运营点播服务、传播他人音乐作品,涉及信息网络传播权授权问题。技术方案已用自建曲库兜底,但合规风险需要你自己评估。

### 14.10 子路径部署要点(`domain.com/music-room`)

**Caddyfile 完整示例**(新站点直接用;已有主站则把 `handle_path` 块合并进现有配置):

```
domain.com {
    handle_path /music-room/* {
        # handle_path: 进入该块时自动剥掉 /music-room 前缀
        @backend path /api/* /socket.io/*
        handle @backend {
            reverse_proxy backend:3000
        }
        handle {
            root * /srv/musicroom/client/dist
            try_files {path} /index.html    # SPA 路由兜底
            file_server
        }
    }
}
```

**前端必须改的 3 处**(漏一处就是白屏/连不上):

| 位置 | 配置 |
|---|---|
| Vite | `base: '/music-room/'`(静态资源加前缀) |
| React Router | `basename="/music-room"`(路由匹配) |
| socket.io 客户端 | `io({ path: '/music-room/socket.io' })`(默认连域名根 `/socket.io`,必须显式指定) |
| fetch/axios | API 地址用 `import.meta.env.BASE_URL + 'api'` 派生,统一前缀 |

**后端零改动**:`handle_path` 剥掉前缀后,后端看到的仍是 `/api/*`、`/socket.io/*`,本地开发(无前缀)与线上(有前缀)行为完全一致。

**nginx 等效配置**(若主站用 nginx,按现有配置调整):

```
location /music-room/ {
    proxy_pass http://backend:3000/;       # 末尾 / 即剥掉 /music-room 前缀
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
location /music-room {
    alias /srv/musicroom/client/dist/;
    try_files $uri $uri/ /music-room/index.html;
}
```
