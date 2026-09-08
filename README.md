# 在线点播室 (Musicroom)

在线点播室:创建房间、点歌、全房间同步收听。线上挂在 `domain.com/music-room` 子路径。

## 功能

- 创建/加入房间(游客即用,可选注册登录)
- 点歌:网易云曲库 + 自建上传曲库(两者结合)
- 同步模式(全房同步收听,房主/DJ 控制)+ 自由模式(共享歌单各自播)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + TypeScript + Vite + socket.io-client + howler.js |
| 后端 | Node.js + TypeScript + Fastify + Prisma + socket.io |
| 数据 | PostgreSQL + Redis + MinIO |
| 部署 | Docker Compose + Caddy(子路径 `/music-room`) |

## 目录结构

```
client/             # React 前端(开发端口 5173)
server/             # Fastify 后端(开发端口 3000)
docker-compose.yml  # 本地开发依赖(PG/Redis/MinIO/网易云API)
DESIGN.md           # 完整方案设计
```

## 快速开始

```bash
# 1. 启动依赖服务
docker compose up -d

# 2. 启动后端(server/)
cd server && npm install && npx prisma migrate dev && npm run dev

# 3. 启动前端(client/)
cd client && npm install && npm run dev
```

访问 http://localhost:5173/music-room/

## 部署到服务器(domain.com/music-room)

```bash
# 服务器上(需要: Docker + 域名 A 记录已指向服务器 IP)
git clone <仓库地址> && cd musicroom
cp .env.example .env        # 修改 JWT_SECRET / 数据库密码 / MinIO 密钥!
./deploy.sh                 # 构建 → 启动 → 迁移 → 健康检查
```

- Caddy 自动申请并续期 Let's Encrypt 证书,全站 HTTPS
- 数据库迁移:`docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy`
- 日志:`docker compose -f docker-compose.prod.yml logs -f backend`
- 备份:PG 每天 `pg_dump`,音频 `mc mirror`(见 DESIGN.md 14.6)
- 大陆服务器必须先完成 ICP 备案(见 DESIGN.md 14.9)
- 完整方案见 [DESIGN.md](DESIGN.md)
