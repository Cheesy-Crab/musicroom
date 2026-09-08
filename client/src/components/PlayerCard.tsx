import type { PlaybackState, SongView } from "../types";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

interface PlayerCardProps {
  playback: PlaybackState | null;
  mode: "sync" | "free";
  isOwner: boolean;
  buffering: boolean;
  localSong: SongView | null;
  localPos: number;
  localDuration: number;
  onSeek: (ms: number) => void;
  onDragState: (dragging: boolean) => void;
  onTogglePlay: () => void;
  onSkip: () => void;
}

export default function PlayerCard({
  playback,
  mode,
  isOwner,
  buffering,
  localSong,
  localPos,
  localDuration,
  onSeek,
  onDragState,
  onTogglePlay,
  onSkip,
}: PlayerCardProps) {
  const song =
    mode === "sync" ? (playback?.song ?? null) : localSong;
  const duration =
    mode === "sync"
      ? (playback?.durationMs ?? 0)
      : localDuration;
  const canControl = mode === "free" || isOwner;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center gap-5">
        {song?.coverUrl ? (
          <img
            src={song.coverUrl}
            alt="封面"
            className="h-24 w-24 rounded-xl bg-slate-800 object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-800 text-3xl">
            🎵
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold">
            {song ? song.title : mode === "sync" ? "等待点歌" : "自由模式"}
          </div>
          <div className="mt-1 truncate text-sm text-slate-400">
            {song ? `${song.artist}${song.album ? ` · ${song.album}` : ""}` : ""}
          </div>
          {mode === "free" && (
            <div className="mt-1 text-xs text-emerald-400">
              自由模式 · 点击右侧队列中的歌曲播放
            </div>
          )}
          {buffering && <div className="mt-1 text-xs text-sky-400">加载中…</div>}
        </div>
      </div>

      <div className="mt-5">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          value={Math.min(localPos, Math.max(duration, 1))}
          disabled={!song || (mode === "sync" && !isOwner)}
          onChange={(e) => {
            onDragState(true);
            onSeek(Number(e.target.value));
          }}
          onMouseUp={() => onDragState(false)}
          onTouchEnd={() => onDragState(false)}
          className="w-full accent-sky-500"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{fmt(localPos)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        {mode === "sync" && (
          <button
            onClick={onTogglePlay}
            disabled={!playback || !canControl}
            title={isOwner ? "播放/暂停" : "仅房主可控制"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-xl hover:bg-sky-500 disabled:opacity-40"
          >
            {playback?.playing ? "⏸" : "▶"}
          </button>
        )}
        {mode === "sync" && isOwner && (
          <button
            onClick={onSkip}
            disabled={!playback}
            title="切歌"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-lg hover:bg-slate-800 disabled:opacity-40"
          >
            ⏭
          </button>
        )}
        {mode === "free" && !localSong && (
          <span className="text-sm text-slate-500">从队列中选择歌曲开始收听</span>
        )}
      </div>
    </div>
  );
}
