import { Redis } from "ioredis";
import { redisUrl } from "./config.js";

/** Redis 单例:房间热状态、在线成员、播放状态、队列视图都放在这里 */
export const redis = new Redis(redisUrl);
