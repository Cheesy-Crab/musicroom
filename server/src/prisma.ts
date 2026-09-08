import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseUrl } from "./config.js";

// Prisma 7 需要显式传入 driver adapter(pg)才能连接数据库
const adapter = new PrismaPg({ connectionString: databaseUrl });

/** Prisma 单例(避免开发热更新时重复创建连接) */
export const prisma = new PrismaClient({ adapter });
