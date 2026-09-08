# 项目进度总结

> 更新于 2026-09-09。完整方案设计见 [DESIGN.md](DESIGN.md),实时任务状态以仓库提交为准。

## 1. 项目概览

**在线点播室(Musicroom)**:创建房间、点歌、全房间同步收听。部署在 `domain.com/music-room` 子路径(域名与服务器待用户确认)。

核心需求:第三方音乐 API(网易云)+ 自建曲库;同步收听 / 自由播放双模式;纯 Web;游客即用 + 可选登录。

## 2. 已完成 — M1 MVP ✅

| 模块 | 内容 | 状态 |
|---|---|---|
| 后端骨架 | Fastify + TS(ESM)+ Prisma 7(pg adapter)+ Redis | ✅ |
| 数据模型 | User/Room/Song/QueueEntry/PlayHistory,migrations 已应用 | ✅ |
| 游客认证 | JWT 30 天、requireAuth 中间件、游客自动注册 | ✅ |
| 房间 REST | 创建(密码/人数上限)/大厅列表/详情 | ✅ |
| 音乐源 | 网易云搜索(封面批量补齐)、播放 URL 实时拉取+format、无版权 403 | ✅ |
| WS 房间服务 | 进房/离房、点歌(去重/自动开播)、移除/置顶/切歌、暂停/seek、双模式切换、时钟校准 ping/pong、空房 5 分钟自动关闭、重启后队列重建 | ✅ |
| 前端大厅 | 游客自动登录、房间列表(15s 轮询)、创建房间弹窗 | ✅ |
| 前端房间页 | 同步播放(时钟偏移+漂移修正>1.5s 强制对齐)、播放器(进度拖动/房主控制)、队列面板、成员面板、双模式切换 | ✅ |
| 点歌台 | 400ms 防抖聚合搜索、网易云/本地双 tab、队列去重标识 | ✅ |
| 部署 | Caddy 子路径剥前缀、多阶段 Dockerfile、docker-compose.prod、deploy.sh 一键部署、本地部署(localhost:8080) | ✅ |
| 自动播放修复 | 浏览器拦截后首次交互恢复播放 | ✅ |

**尚未实现(规划内)**:自建曲库上传(MinIO 已就绪)、注册登录(游客数据可升级)、歌词、聊天、DJ 任命、房间发现。

## 3. 开发历程(16 个提交,一步一提交)

```
3638eb3 fix(demo): 种子脚本 socket.io path 参数修正 + 失败快速报错
382f696 feat(deploy): 本地部署配置 + 演示数据脚本
bf57e34 fix(client): 自动播放被拦截后首次交互恢复播放
e781467 test(e2e): 双浏览器同步播放端到端验证
fee5391 feat(deploy): 生产部署文件(Caddyfile/deploy.sh/Dockerfile)
0b9f95c feat(client): 点歌台弹窗(搜索/点歌)
d3bc39e feat(client): 房间页(播放器/队列/成员/双模式/同步播放)
94c8235 feat(client): 大厅页 + 创建房间
8cda715 feat(client): 前端骨架(Vite+React+Router, 子路径 base)
5519387 feat(server): socket.io 房间服务(进房/队列/播放状态机)
8deaf5b feat(server): 网易云音乐源代理(搜索/播放URL)
69797b8 feat(server): 房间 REST API(创建/列表/详情)
42c974b feat(server): 游客认证(JWT + requireAuth)
bb0a95e feat(server): 后端骨架 + Prisma 数据模型
1984547 chore: 本地开发环境 docker-compose + 环境变量模板
2edc921 chore: 初始化项目骨架
```

## 4. 验证记录(全部实测通过)

| 验证 | 结果 |
|---|---|
| WS 集成测试(快照/成员/点歌/去重/权限/切歌/双模式/时钟/鉴权) | 19/19 ✅ |
| 双浏览器 E2E(同歌同题/进度推进/误差<2.5s/seek 双窗口跟随/徽标) | 9/9 ✅ |
| 生产栈冒烟(子路径页面/静态资源/API 代理/WS 握手 101) | 4/4 ✅ |
| 无头浏览器实访问(大厅→进房→播放中→进度 22s) | ✅ |
| 生产镜像构建(server + caddy 多阶段) | ✅ |

## 5. 部署状态

- **GitHub 已发布(公开)**:https://github.com/Cheesy-Crab/musicroom (SSH 推送已打通)
- **本地部署已验证**:`docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d` → http://localhost:8080/music-room/
- **服务器上线待办**:服务器装 Docker → `git clone` → `cp .env.example .env`(改密钥)→ `./deploy.sh` → 域名 A 记录解析 → 验证
- ⚠️ **ICP 备案**:大陆服务器必须备案才能用 80/443 访问,需 1~3 周,**尚未启动**

## 6. 下一步

1. **M2**:注册登录(绑定游客数据)→ 音频上传 + 自建曲库(MinIO/ffprobe 已规划)→ 歌词 → 聊天
2. **M3**:房间发现、DJ 任命、播放历史、移动端打磨、水平扩容(Redis adapter)
3. **上线**:按第 5 节清单执行

## 7. 环境要点(详细坑位见 CLAUDE 记忆)

- Docker Hub 被墙:daemon.json 已配镜像源;npm 用 npmmirror(.npmrc 已入库)
- Prisma 7 新架构:连接串在 prisma.config.ts、运行时须传 pg adapter、`migrate dev` 非交互不可用(手写 SQL + `migrate deploy`)
- Fastify 5:所有钩子必须 async,同步钩子会导致请求永久挂起
- 前端 base=`/music-room/` 与 Caddy `handle_path` 剥前缀配合,开发/生产行为一致
- 网易云播放 URL 有时效,必须实时拉取;搜索无封面需 song/detail 批量补
