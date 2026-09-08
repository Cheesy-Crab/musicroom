import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type { RoomView } from "../types";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function CreateRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [maxMembers, setMaxMembers] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ room: RoomView; code?: string; message?: string }>(
        "/rooms",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            password: password || undefined,
            maxMembers,
          }),
        }
      );
      if (r.code) {
        setError(r.message ?? "创建失败");
        setBusy(false);
        return;
      }
      onCreated(r.room.id);
    } catch {
      setError("网络错误,请重试");
      setBusy(false);
    }
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
        <h2 className="text-lg font-bold">创建房间</h2>
        <label className="mt-4 block text-sm text-slate-400">
          房间名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            placeholder="例如:周杰伦专场"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>
        <label className="mt-3 block text-sm text-slate-400">
          房间密码(可选,4-20 位)
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={20}
            placeholder="留空则无需密码"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>
        <label className="mt-3 block text-sm text-slate-400">
          人数上限
          <input
            type="number"
            min={2}
            max={200}
            value={maxMembers}
            onChange={(e) => setMaxMembers(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 py-2 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-sky-600 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "创建中…" : "创建并进入"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LobbyPage() {
  const { user, ready, init } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomView[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const r = await api<{ rooms: RoomView[] }>("/rooms");
      setRooms(r.rooms);
    } catch {
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    loadRooms();
    const t = setInterval(loadRooms, 15_000); // 大厅 15s 轮询刷新
    return () => clearInterval(t);
  }, [loadRooms]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">在线点播室</h1>
          <p className="mt-1 text-sm text-slate-400">
            {ready ? `你好,${user?.nickname ?? "游客"}` : "初始化中…"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!ready}
          className="rounded-lg bg-sky-600 px-4 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          + 创建房间
        </button>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-300">开放房间</h2>
        {rooms === null ? (
          <p className="mt-4 text-slate-500">加载中…</p>
        ) : rooms.length === 0 ? (
          <p className="mt-4 text-slate-500">
            还没有开放房间,点击右上角创建第一个吧
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => navigate(`/room/${room.id}`)}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-sky-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-medium">{room.name}</span>
                  <span className="flex shrink-0 gap-1 text-xs">
                    {room.hasPassword && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                        🔒
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        room.mode === "sync"
                          ? "bg-sky-950 text-sky-300"
                          : "bg-emerald-950 text-emerald-300"
                      }`}
                    >
                      {room.mode === "sync" ? "同步" : "自由"}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  房主 {room.owner.nickname} · 上限 {room.maxMembers} 人 ·{" "}
                  {formatTime(room.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => navigate(`/room/${roomId}`)}
        />
      )}
    </div>
  );
}
