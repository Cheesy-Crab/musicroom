/** 与后端 REST/WS 载荷对应的共享类型 */

export interface RoomView {
  id: string;
  name: string;
  mode: "sync" | "free";
  maxMembers: number;
  status: string;
  createdAt: string;
  owner: { id: string; nickname: string; avatarUrl: string | null };
  hasPassword: boolean;
}

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

export interface QueueEntryView {
  id: string;
  song: SongView;
  requestedBy: { id: string; nickname: string };
  requestedAt: number;
  status: "queued" | "playing";
}

export interface PlaybackState {
  entryId: string;
  songId: string;
  song: SongView;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  seq: number;
  ts: number; // 服务端时间戳,用于时钟校准后的进度推算
}

export interface MemberInfo {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role: "owner" | "listener";
  joinedAt: number;
}

export interface RoomSnapshot {
  room: {
    id: string;
    name: string;
    mode: "sync" | "free";
    ownerId: string;
    maxMembers: number;
    hasPassword: boolean;
  };
  members: MemberInfo[];
  queue: QueueEntryView[];
  playback: PlaybackState | null;
}

export interface WsError {
  code: string;
  message: string;
}
