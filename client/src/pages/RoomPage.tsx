import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useRoom } from "../store/room";
import { useSyncPlayback } from "../hooks/useSyncPlayback";
import PlayerCard from "../components/PlayerCard";
import QueuePanel from "../components/QueuePanel";
import MembersPanel from "../components/MembersPanel";
import SongSearchModal from "../components/SongSearchModal";

function PasswordModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold">🔒 房间需要密码</h2>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入房间密码"
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-sky-500"
          autoFocus
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 py-2 hover:bg-slate-800"
          >
            返回大厅
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-sky-600 py-2 font-medium hover:bg-sky-500"
          >
            进入房间
          </button>
        </div>
      </form>
    </div>
  );
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, ready, init } = useAuth();
  const room = useRoom();
  const [needPassword, setNeedPassword] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // 游客会话就绪后进房
  useEffect(() => {
    init();
  }, [init]);
  useEffect(() => {
    if (ready && user && id && !room.socket) {
      room.join(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);
  useEffect(() => {
    return () => room.leave(); // 离开页面即退房
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 服务端错误分发:密码房弹窗/房间失效返回大厅/其余 toast
  useEffect(() => {
    const e = room.lastError;
    if (!e) return;
    room.clearError();
    if (e.code === "PASSWORD_REQUIRED" || e.code === "WRONG_PASSWORD") {
      setNeedPassword(true);
    } else if (e.code === "ROOM_NOT_FOUND") {
      showToast(e.message);
      window.setTimeout(() => navigate("/"), 1500);
    } else {
      showToast(e.message);
    }
  }, [room.lastError, room.clearError, navigate, showToast]);

  const isOwner = !!user && !!room.snapshot && user.id === room.snapshot.room.ownerId;

  const queueSongIds = useMemo(
    () => new Set(room.queue.map((e) => e.song.id)),
    [room.queue]
  );

  const { localPos, setLocalPos, localDuration, localSong, buffering, playLocal, seekLocal, setDragging } =
    useSyncPlayback(room.playback, room.mode, showToast);

  const handleSeek = useCallback(
    (ms: number) => {
      setLocalPos(ms); // 拖动时立即更新本地显示,让进度条跟手
      if (room.mode === "sync") {
        if (isOwner) room.control("seek", ms);
      } else {
        seekLocal(ms);
      }
    },
    [room.mode, isOwner, seekLocal, setLocalPos]
  );

  const handleTogglePlay = useCallback(() => {
    if (!isOwner || !room.playback) return;
    room.control(room.playback.playing ? "pause" : "play");
  }, [isOwner, room.playback]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => room.leave()}
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            ← 返回
          </button>
          <h1 className="truncate text-xl font-bold">
            {room.snapshot?.room.name ?? "进入房间中…"}
          </h1>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs ${
              room.connected ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"
            }`}
          >
            {room.connected ? "已连接" : "连接中…"}
          </span>
        </div>
        <button
          onClick={() => setShowSearch(true)}
          className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500"
        >
          🎵 点歌
        </button>
        {isOwner && room.snapshot && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-slate-500">模式</span>
            <div className="flex rounded-lg border border-slate-700 p-0.5">
              {(["sync", "free"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => room.switchMode(m)}
                  className={`rounded-md px-3 py-1 text-xs transition ${
                    room.mode === m
                      ? m === "sync"
                        ? "bg-sky-600"
                        : "bg-emerald-600"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "sync" ? "同步收听" : "自由播放"}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <PlayerCard
            playback={room.playback}
            mode={room.mode}
            isOwner={isOwner}
            buffering={buffering}
            localSong={localSong}
            localPos={localPos}
            localDuration={localDuration}
            onSeek={handleSeek}
            onDragState={setDragging}
            onTogglePlay={handleTogglePlay}
            onSkip={() => room.skip()}
          />
          <QueuePanel
            queue={room.queue}
            myId={user?.id ?? null}
            isOwner={isOwner}
            mode={room.mode}
            playingEntryId={room.playback?.entryId ?? null}
            onRemove={(entryId) => room.removeEntry(entryId)}
            onTop={(entryId) => room.topEntry(entryId)}
            onPlayLocal={playLocal}
          />
        </div>
        <div className="space-y-4">
          <MembersPanel members={room.members} myId={user?.id ?? null} />
        </div>
      </main>

      {showSearch && (
        <SongSearchModal
          onClose={() => setShowSearch(false)}
          onAdd={(songId) => room.addSong(songId)}
          queueSongIds={queueSongIds}
        />
      )}

      {needPassword && (
        <PasswordModal
          onClose={() => {
            setNeedPassword(false);
            navigate("/");
          }}
          onSubmit={(password) => {
            setNeedPassword(false);
            if (id) room.join(id, password);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
