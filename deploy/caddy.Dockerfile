# Caddy 边缘容器:构建阶段产出前端静态文件,运行阶段托管 + 反代 + 自动 HTTPS
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/musicroom/client/dist
