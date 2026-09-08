import { useCallback, useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import { api } from "../lib/api";
import { clock } from "../lib/clock";
import type { PlaybackState, SongView } from "../types";

/**
 * 同步播放核心:
 * - 同步模式:以服务端 playback.state 为准。收到广播后计算 serverPos
 *   (positionMs + 已流逝时间),换歌时拉 URL 重建 Howl,漂移 > 1.5s 强制对齐。
 * - 自由模式:playLocal 本地播放,与队列无关。
 */
export function useSyncPlayback(
  playback: PlaybackState | null,
  mode: "sync" | "free",
  onError: (msg: string) => void
) {
  const soundRef = useRef<Howl | null>(null);
  const loadedSongRef = useRef<string | null>(null);
  const failedSongRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const pbRef = useRef<PlaybackState | null>(null);

  const [localPos, setLocalPos] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const [localSong, setLocalSong] = useState<SongView | null>(null);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    pbRef.current = playback;
  }, [playback]);

  // 浏览器自动播放策略:首次打开页面时 play() 会被拦截且不再重试,
  // 在用户第一次点击/触摸时补一次恢复播放
  useEffect(() => {
    const unlock = () => {
      const sound = soundRef.current;
      if (sound && pbRef.current?.playing && !sound.playing()) {
        sound.play();
      }
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // 进度显示:本地 howler 播放时读 seek;同步模式无音频(加载失败)时按服务端状态推算
  useEffect(() => {
    const t = setInterval(() => {
      if (draggingRef.current) return;
      const sound = soundRef.current;
      if (mode === "sync" && pbRef.current) {
        const s = pbRef.current;
        if (sound?.playing()) {
          setLocalPos(Math.round(sound.seek() * 1000));
        } else {
          const serverPos =
            s.positionMs +
            (s.playing ? Math.max(Date.now() + clock.offset - s.ts, 0) : 0);
          setLocalPos(serverPos);
        }
      } else if (sound?.playing()) {
        setLocalPos(Math.round(sound.seek() * 1000));
      }
    }, 500);
    return () => clearInterval(t);
  }, [mode]);

  // 同步模式:响应服务端状态(每次广播触发一次对齐)
  useEffect(() => {
    if (mode !== "sync" || !playback) return;
    const serverPos =
      playback.positionMs +
      (playback.playing
        ? Math.max(Date.now() + clock.offset - playback.ts, 0)
        : 0);

    void (async () => {
      if (
        loadedSongRef.current !== playback.songId &&
        failedSongRef.current !== playback.songId
      ) {
        try {
          setBuffering(true);
          const r = await api<{
            url: string;
            format?: string;
            code?: string;
            message?: string;
          }>(`/songs/${playback.songId}/url`);
          if (r.code) {
            failedSongRef.current = playback.songId;
            onError(r.message ?? "无法播放该歌曲");
            setBuffering(false);
            return;
          }
          soundRef.current?.unload();
          const sound = new Howl({
            src: [r.url],
            format: [r.format ?? "mp3"],
            html5: true,
          });
          soundRef.current = sound;
          loadedSongRef.current = playback.songId;
          failedSongRef.current = null;
          sound.seek(Math.max(serverPos, 0) / 1000);
          if (playback.playing) sound.play();
          setLocalPos(serverPos);
        } catch {
          failedSongRef.current = playback.songId;
          onError("音频加载失败");
        }
        setBuffering(false);
        return;
      }
      const sound = soundRef.current;
      if (!sound) return;
      const local = sound.seek() * 1000;
      if (Math.abs(local - serverPos) > 1500) {
        sound.seek(Math.max(serverPos, 0) / 1000); // 漂移修正
      }
      if (playback.playing && !sound.playing()) sound.play();
      if (!playback.playing && sound.playing()) sound.pause();
      setLocalPos(serverPos);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, mode]);

  /** 自由模式:点击队列条目本地播放 */
  const playLocal = useCallback(
    async (song: SongView) => {
      try {
        setBuffering(true);
        const r = await api<{
          url: string;
          format?: string;
          code?: string;
          message?: string;
        }>(`/songs/${song.id}/url`);
        if (r.code) {
          onError(r.message ?? "无法播放该歌曲");
          setBuffering(false);
          return;
        }
        soundRef.current?.unload();
        const sound = new Howl({
          src: [r.url],
          format: [r.format ?? "mp3"],
          html5: true,
        });
        soundRef.current = sound;
        loadedSongRef.current = song.id;
        failedSongRef.current = null;
        sound.play();
        setLocalSong(song);
        setLocalDuration(song.durationMs);
        setLocalPos(0);
      } catch {
        onError("音频加载失败");
      }
      setBuffering(false);
    },
    [onError]
  );

  /** 自由模式:拖动进度(仅本地) */
  const seekLocal = useCallback((ms: number) => {
    soundRef.current?.seek(ms / 1000);
    setLocalPos(ms);
  }, []);

  /** 拖动期间暂停进度自动刷新 */
  const setDragging = useCallback((v: boolean) => {
    draggingRef.current = v;
  }, []);

  return {
    localPos,
    setLocalPos,
    localDuration,
    localSong,
    buffering,
    playLocal,
    seekLocal,
    setDragging,
  };
}
