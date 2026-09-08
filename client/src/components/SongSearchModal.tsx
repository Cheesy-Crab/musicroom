import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { SongView } from "../types";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

interface SongSearchModalProps {
  onClose: () => void;
  onAdd: (songId: string) => void;
  /** 队列中已有的歌曲 id,显示"已在队列" */
  queueSongIds: Set<string>;
}

export default function SongSearchModal({
  onClose,
  onAdd,
  queueSongIds,
}: SongSearchModalProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"netease" | "local">("netease");
  const [netease, setNetease] = useState<SongView[]>([]);
  const [local, setLocal] = useState<SongView[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 防抖搜索(400ms)
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const keyword = q.trim();
    if (!keyword) {
      setNetease([]);
      setLocal([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const r = await api<{ netease: SongView[]; local: SongView[] }>(
          `/songs/search?q=${encodeURIComponent(keyword)}`
        );
        setNetease(r.netease ?? []);
        setLocal(r.local ?? []);
      } catch {
        setNetease([]);
        setLocal([]);
      }
      setSearching(false);
    }, 400);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [q]);

  const list = tab === "netease" ? netease : local;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[70vh] w-full max-w-lg flex-col rounded-2xl bg-slate-900 p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">🎵 点歌台</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800"
          >
            关闭
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索歌曲 / 歌手,例如:周杰伦"
          autoFocus
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-sky-500"
        />

        <div className="mt-3 flex gap-1 rounded-lg border border-slate-700 p-0.5">
          {(
            [
              ["netease", "网易云"],
              ["local", "本地曲库"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md px-3 py-1 text-sm transition ${
                tab === key ? "bg-sky-600" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <p className="py-8 text-center text-sm text-slate-500">搜索中…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {q.trim()
                ? "没有找到相关歌曲,换个关键词试试"
                : "输入关键词开始搜索"}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((song) => {
                const inQueue = queueSongIds.has(song.id);
                return (
                  <li
                    key={song.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-2"
                  >
                    {song.coverUrl ? (
                      <img
                        src={song.coverUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg bg-slate-800 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg">
                        🎵
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {song.title}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ""} ·{" "}
                        {fmt(song.durationMs)}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(song.id)}
                      disabled={inQueue}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                        inQueue
                          ? "bg-slate-800 text-slate-500"
                          : "bg-sky-600 hover:bg-sky-500"
                      }`}
                    >
                      {inQueue ? "已在队列" : "点歌"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
