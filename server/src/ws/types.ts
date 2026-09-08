/** 房间在线成员(DJ 任命后续版本加 role 值) */
export interface MemberInfo {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role: "owner" | "listener";
  joinedAt: number;
}

/** 歌曲视图(与 REST 层 toSongView 同构) */
export interface SongView {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  coverUrl: string | null;
  source: string;
  sourceId: string | null;
}

/** 队列条目视图(Redis 热数据,PG 为落盘记录) */
export interface QueueEntryView {
  id: string;
  song: SongView;
  requestedBy: { id: string; nickname: string };
  requestedAt: number;
  status: "queued" | "playing";
}

/**
 * 播放状态:服务端是时间权威。
 * ts = 状态产生时刻的服务端时间戳,客户端用它 + 时钟偏移计算当前进度。
 */
export interface PlaybackState {
  entryId: string;
  songId: string;
  song: SongView;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  seq: number;
  ts: number;
}
