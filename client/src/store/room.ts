import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { WS_PATH } from "../lib/api";
import { clock } from "../lib/clock";
import type {
  MemberInfo,
  PlaybackState,
  QueueEntryView,
  RoomSnapshot,
  WsError,
} from "../types";

interface RoomStore {
  socket: Socket | null;
  snapshot: RoomSnapshot | null;
  members: MemberInfo[];
  queue: QueueEntryView[];
  playback: PlaybackState | null;
  mode: "sync" | "free";
  connected: boolean;
  lastError: WsError | null;
  clearError: () => void;
  join: (roomId: string, password?: string) => void;
  leave: () => void;
  addSong: (songId: string) => void;
  removeEntry: (entryId: string) => void;
  topEntry: (entryId: string) => void;
  skip: () => void;
  control: (action: "play" | "pause" | "seek", positionMs?: number) => void;
  switchMode: (mode: "sync" | "free") => void;
}

let socket: Socket | null = null;

/** 时钟校准:3 轮 ping/pong 取中位数偏移 */
function calibrateClock(s: Socket): void {
  const offsets: number[] = [];
  const round = (n: number) => {
    if (n >= 3) {
      offsets.sort((a, b) => a - b);
      clock.offset = offsets[1];
      return;
    }
    const t0 = Date.now();
    s.emit("ping", { t: t0 });
    s.once("pong", ({ t, s: serverTs }) => {
      const rtt = Date.now() - t0;
      offsets.push(serverTs - (t + rtt / 2));
      round(n + 1);
    });
  };
  round(0);
}

function bindListeners(s: Socket, set: (partial: Partial<RoomStore>) => void): void {
  s.on("room.snapshot", (snap: RoomSnapshot) =>
    set({
      snapshot: snap,
      members: snap.members,
      queue: snap.queue,
      playback: snap.playback,
      mode: snap.room.mode,
    })
  );
  s.on("members.changed", (p: { members: MemberInfo[] }) =>
    set({ members: p.members })
  );
  s.on("queue.updated", (p: { queue: QueueEntryView[] }) =>
    set({ queue: p.queue })
  );
  s.on("playback.state", (playback: PlaybackState | null) =>
    set({ playback })
  );
  s.on("mode.changed", (p: { mode: "sync" | "free" }) =>
    set({ mode: p.mode })
  );
  s.on("error", (e: WsError) => set({ lastError: e }));
  s.on("connect", () => {
    set({ connected: true });
    calibrateClock(s);
  });
  s.on("disconnect", () => set({ connected: false }));
}

export const useRoom = create<RoomStore>((set) => ({
  socket: null,
  snapshot: null,
  members: [],
  queue: [],
  playback: null,
  mode: "sync",
  connected: false,
  lastError: null,

  clearError: () => set({ lastError: null }),

  join: (roomId, password) => {
    socket?.disconnect();
    const token = localStorage.getItem("musicroom_token") ?? "";
    socket = io({
      auth: { token },
      path: WS_PATH,
      transports: ["websocket"],
    });
    bindListeners(socket, set);
    set({
      socket,
      snapshot: null,
      members: [],
      queue: [],
      playback: null,
      lastError: null,
    });
    socket.on("connect", () => {
      socket!.emit("room.join", { roomId, password });
    });
  },

  leave: () => {
    socket?.emit("room.leave");
    socket?.disconnect();
    socket = null;
    set({
      socket: null,
      connected: false,
      snapshot: null,
      members: [],
      queue: [],
      playback: null,
    });
  },

  addSong: (songId) => socket?.emit("queue.add", { songId }),
  removeEntry: (entryId) => socket?.emit("queue.remove", { entryId }),
  topEntry: (entryId) => socket?.emit("queue.top", { entryId }),
  skip: () => socket?.emit("queue.skip"),
  control: (action, positionMs) =>
    socket?.emit("playback.control", { action, positionMs }),
  switchMode: (mode) => socket?.emit("mode.switch", { mode }),
}));
