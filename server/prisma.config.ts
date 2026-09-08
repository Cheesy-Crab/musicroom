import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 CLI 配置:migrate/introspect 命令从这里读取数据库连接串
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
