import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useEditor, useProjectDuration } from '../store/editorStore';
import { Compositor } from '../lib/compositor';
import { formatTime } from '../lib/time';

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<Compositor | null>(null);

  const clips = useEditor((s) => s.clips);
  const tracks = useEditor((s) => s.tracks);
  const assets = useEditor((s) => s.assets);
  const settings = useEditor((s) => s.settings);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);

  const duration = useProjectDuration();
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const renderSize = useMemo(() => {
    const maxW = 1280;
    const scale = Math.min(1, maxW / settings.width);
    return {
      width: Math.round(settings.width * scale),
      height: Math.round(settings.height * scale),
    };
  }, [settings.width, settings.height]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const comp = new Compositor(canvasRef.current);
    compRef.current = comp;
    return () => {
      comp.dispose();
      compRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    canvasRef.current.width = renderSize.width;
    canvasRef.current.height = renderSize.height;
    compRef.current?.render(playhead, clips, tracks, assetMap);
  }, [renderSize.width, renderSize.height]);

  // Redraw whenever the model changes while paused.
  useEffect(() => {
    if (playing) return;
    const comp = compRef.current;
    if (!comp) return;
    comp.sync(playhead, clips, tracks, assetMap, false);
    comp.render(playhead, clips, tracks, assetMap);
  }, [playhead, clips, tracks, assetMap, playing]);

  // Playback loop
  useEffect(() => {
    if (!playing) {
      compRef.current?.pauseAll();
      return;
    }
    const total = duration || 1;
    let raf = 0;
    let last = performance.now();
    let time = playhead >= total - 0.001 ? 0 : playhead;
    let lastPush = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      time += dt;

      if (time >= total) {
        setPlayhead(total);
        setPlaying(false);
        compRef.current?.pauseAll();
        return;
      }

      const comp = compRef.current;
      if (comp) {
        comp.sync(time, clips, tracks, assetMap, true);
        comp.render(time, clips, tracks, assetMap);
      }

      if (now - lastPush > 66) {
        lastPush = now;
        setPlayhead(time);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      /* fullscreen may be blocked */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink-900">
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2 md:p-4">
        <canvas
          ref={canvasRef}
          className="max-h-full w-auto max-w-full rounded-sm bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{ aspectRatio: `${settings.width} / ${settings.height}` }}
        />
        {!duration && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-zinc-400">No media on the timeline</p>
            <p className="max-w-xs text-xs text-zinc-600">
              Import a video, drop it onto a track, and press play.
            </p>
          </div>
        )}
        <button
          onClick={toggleFullscreen}
          className="icon-btn absolute right-3 top-3 bg-black/50 backdrop-blur"
          title="Fullscreen"
        >
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-ink-700 bg-ink-850 px-2 py-2 md:px-4">
        <button className="icon-btn" onClick={() => setPlayhead(0)} title="Go to start">
          <SkipBack size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setPlayhead(Math.max(0, playhead - 1 / settings.fps))}
          title="Previous frame"
        >
          <SkipBack size={15} className="rotate-180 scale-x-50" />
        </button>

        <button
          onClick={() => setPlaying(!playing)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-black transition hover:bg-accent-soft active:scale-95"
          title="Play / pause (Space)"
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>

        <button
          className="icon-btn"
          onClick={() => setPlayhead(Math.min(duration, playhead + 1 / settings.fps))}
          title="Next frame"
        >
          <SkipForward size={15} className="rotate-180 scale-x-50" />
        </button>
        <button className="icon-btn" onClick={() => setPlayhead(duration)} title="Go to end">
          <SkipForward size={15} />
        </button>

        <div className="ml-1 font-mono text-xs tabular-nums text-zinc-300">
          <span className="text-accent">{formatTime(playhead, settings.fps)}</span>
          <span className="mx-1 text-zinc-600">/</span>
          <span className="text-zinc-500">{formatTime(duration, settings.fps)}</span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.01}
          value={Math.min(playhead, duration)}
          onChange={(e) => setPlayhead(Number(e.target.value))}
          className="mx-2 hidden flex-1 md:block"
          aria-label="Seek"
        />

        <button
          className="icon-btn ml-auto"
          onClick={() => {
            setMuted((m) => !m);
            for (const el of document.querySelectorAll('video')) el.muted = !muted;
          }}
          title="Mute all"
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </div>
  );
}
