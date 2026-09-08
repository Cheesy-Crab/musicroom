#!/usr/bin/env bash
# 一键部署:在服务器上执行(代码已 git pull 到最新)
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> 构建镜像(前端静态 + 后端)"
$COMPOSE build

echo "==> 启动服务"
$COMPOSE up -d

echo "==> 执行数据库迁移"
$COMPOSE exec -T backend npx prisma migrate deploy

echo "==> 等待后端就绪"
for i in $(seq 1 15); do
  if $COMPOSE exec -T backend wget -q -O /dev/null http://localhost:3000/api/health; then
    echo "✓ 后端健康检查通过"
    break
  fi
  [ "$i" = 15 ] && echo "✗ 后端健康检查失败,请查看日志: docker compose -f docker-compose.prod.yml logs backend"
  sleep 2
done

echo "==> 部署完成,访问 https://domain.com/music-room/ (证书由 Caddy 自动签发)"
