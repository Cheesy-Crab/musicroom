import type { QueueEntryView, SongView } from "../types";

interface QueuePanelProps {
  queue: QueueEntryView[];
  myId: string | null;
  isOwner: boolean;
  mode: "sync" | "free";
  playingEntryId: string | null;
  onRemove: (entryId: string) => void;
  onTop: (entryId: string) => void;
  onPlayLocal: (song: SongView) => void;
}

export default function QueuePanel({
  queue,
  myId,
  isOwner,
  mode,
  playingEntryId,
  onRemove,
  onTop,
  onPlayLocal,
}: QueuePanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-400">
        点播队列 {queue.length > 0 && `(${queue.length})`}
      </h2>
      {queue.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          队列空空如也,点「点歌」来一首吧
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {queue.map((entry, idx) => {
            const isPlaying = entry.id === playingEntryId;
            const isHead = idx === 0;
            const canRemove =
              !isPlaying && (isOwner || entry.requestedBy.id === myId);
            return (
              <li
                key={entry.id}
                onClick={() => mode === "free" && onPlayLocal(entry.song)}
                className={`flex items-center gap-3 rounded-xl border p-2 transition ${
                  isPlaying
                    ? "border-sky-600 bg-sky-950/40"
                    : "border-slate-800 bg-slate-900 hover:border-slate-600"
                } ${mode === "free" ? "cursor-pointer" : ""}`}
              >
                <span className="w-5 shrink-0 text-center text-xs text-slate-500">
                  {isPlaying ? "▶" : idx + 1}
                </span>
                {entry.song.coverUrl ? (
                  <img
                    src={entry.song.coverUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg bg-slate-800 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg">
                    🎵
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {entry.song.title}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {entry.song.artist} · 点歌人 {entry.requestedBy.nickname}
                  </div>
                </div>
                {isPlaying ? (
                  <span className="shrink-0 rounded bg-sky-950 px-2 py-0.5 text-xs text-sky-300">
                    播放中
                  </span>
                ) : (
                  <div className="flex shrink-0 gap-1">
                    {isOwner && !isHead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTop(entry.id);
                        }}
                        title="置顶(下一首)"
                        className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                      >
                        顶
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(entry.id);
                        }}
                        title="移除"
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-rose-400 hover:bg-slate-800"
                      >
                        移除
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
