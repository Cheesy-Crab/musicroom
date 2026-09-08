# 后端生产镜像:构建阶段编译 TS + 生成 Prisma 客户端,运行阶段只留产物
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json ./
# postinstall 里的 prisma generate 需要 schema,先跳过,COPY 完再显式生成
RUN npm ci --ignore-scripts
COPY server/prisma ./prisma
COPY server/prisma.config.ts server/tsconfig.json ./
COPY server/src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
# prisma CLI 在 dependencies 中(migrate deploy 需要);--ignore-scripts 跳过 postinstall
RUN npm ci --omit=dev --ignore-scripts
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
