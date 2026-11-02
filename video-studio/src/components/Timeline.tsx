import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Lock,
  LockOpen,
  Merge,
  Minus,
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Video,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import clsx from 'clsx';
import { useEditor, useProjectDuration } from '../store/editorStore';
import type { Clip, Track, TrackKind } from '../types';
import { formatDuration } from '../lib/time';

const HEADER_W = 76;

const trackIcon = (kind: TrackKind) =>
  kind === 'video' ? <Video size={12} /> : kind === 'audio' ? <Music size={12} /> : <Type size={12} />;

const clipColour = (kind: TrackKind) =>
  kind === 'video'
    ? 'from-[#1f4e79] to-[#2b6ca3] border-[#4d94d1]'
    : kind === 'audio'
      ? 'from-[#1e5138] to-[#2a7a52] border-[#4fbf8a]'
      : 'from-[#4a2b6b] to-[#6a3d99] border-[#a07ad1]';

interface DragState {
  mode: 'move' | 'left' | 'right';
  clipId: string;
  startX: number;
  origStart: number;
  origDuration: number;
  origIn: number;
}

export function Timeline({ className }: { className?: string }) {
  const tracks = useEditor((s) => s.tracks);
  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const zoom = useEditor((s) => s.zoom);
  const playhead = useEditor((s) => s.playhead);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const settings = useEditor((s) => s.settings);

  const setZoom = useEditor((s) => s.setZoom);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const selectClip = useEditor((s) => s.selectClip);
  const updateClip = useEditor((s) => s.updateClip);
  const deleteClip = useEditor((s) => s.deleteClip);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const mergeWithNext = useEditor((s) => s.mergeWithNext);
  const duplicateClip = useEditor((s) => s.duplicateClip);
  const addTrack = useEditor((s) => s.addTrack);
  const updateTrack = useEditor((s) => s.updateTrack);
  const removeTrack = useEditor((s) => s.removeTrack);
  const addClip = useEditor((s) => s.addClip);

  const duration = useProjectDuration();
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const contentSeconds = Math.max(duration + 8, 20);
  const contentWidth = contentSeconds * zoom;
  const totalRowsHeight = tracks.length * 56;

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;

  const snap = useCallback(
    (value: number) => {
      const grid = 1 / Math.max(1, settings.fps / 2);
      return Math.max(0, Math.round(value / grid) * grid);
    },
    [settings.fps],
  );

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      setPlayhead(Math.max(0, (clientX - rect.left) / zoom));
    },
    [setPlayhead, zoom],
  );

  const beginDrag = (e: React.PointerEvent, clip: Clip, mode: DragState['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);
    dragRef.current = {
      mode,
      clipId: clip.id,
      startX: e.clientX,
      origStart: clip.start,
      origDuration: clip.duration,
      origIn: clip.inPoint,
    };

    const move = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (ev.clientX - drag.startX) / zoom;
      const current = useEditor.getState().clips.find((c) => c.id === drag.clipId);
      if (!current) return;
      const minDur = 0.15;

      if (drag.mode === 'move') {
        updateClip(drag.clipId, { start: snap(drag.origStart + delta) });
      } else if (drag.mode === 'right') {
        updateClip(drag.clipId, { duration: Math.max(minDur, snap(drag.origDuration + delta)) });
      } else {
        const newStart = Math.max(0, Math.min(snap(drag.origStart + delta), drag.origStart + drag.origDuration - minDur));
        const shift = newStart - drag.origStart;
        updateClip(drag.clipId, {
          start: newStart,
          duration: Math.max(minDur, drag.origDuration - shift),
          inPoint: Math.max(0, drag.origIn + shift * current.speed),
        });
      }
    };

    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const handleDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (!assetId) return;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const at = Math.max(0, (e.clientX - rect.left) / zoom);
    const expectedKind = asset.kind === 'audio' ? 'audio' : 'video';
    if (track.kind !== expectedKind) return;
    addClip({
      trackId: track.id,
      assetId: asset.id,
      start: snap(at),
      duration: Math.min(asset.duration || 5, asset.kind === 'image' ? 5 : asset.duration),
    });
  };

  const rulerStep = useMemo(() => {
    if (zoom >= 120) return 0.5;
    if (zoom >= 80) return 1;
    if (zoom >= 45) return 2;
    if (zoom >= 22) return 5;
    return 10;
  }, [zoom]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= contentSeconds; t += rulerStep) out.push(t);
    return out;
  }, [contentSeconds, rulerStep]);

  return (
    <section className={clsx('flex min-h-0 flex-col border-t border-ink-700 bg-ink-850', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-ink-700 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button className="icon-btn" onClick={() => setZoom(zoom / 1.4)} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button className="icon-btn" onClick={() => setZoom(zoom * 1.4)} title="Zoom in">
            <ZoomIn size={15} />
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-ink-600" />

        <button className="btn" onClick={splitAtPlayhead} title="Split at playhead (S)">
          <Scissors size={13} /> <span className="hidden sm:inline">Split</span>
        </button>
        <button
          className="btn"
          onClick={mergeWithNext}
          disabled={!selectedClip}
          title="Merge with the adjacent clip that follows"
        >
          <Merge size={13} /> <span className="hidden sm:inline">Merge</span>
        </button>
        <button className="btn" onClick={() => selectedClip && duplicateClip(selectedClip.id)} disabled={!selectedClip}>
          <Copy size={13} /> <span className="hidden sm:inline">Duplicate</span>
        </button>
        <button
          className="btn text-red-300 hover:border-red-500/50"
          onClick={() => selectedClip && deleteClip(selectedClip.id)}
          disabled={!selectedClip}
          title="Delete clip (Del)"
        >
          <Trash2 size={13} /> <span className="hidden sm:inline">Delete</span>
        </button>

        <div className="relative ml-auto">
          <button className="btn" onClick={() => setMenuOpen((v) => !v)}>
            <Plus size={13} /> Track
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-40 mt-1 w-36 overflow-hidden rounded-md border border-ink-600 bg-ink-750 shadow-xl"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {(['video', 'audio', 'text'] as TrackKind[]).map((kind) => (
                <button
                  key={kind}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-ink-700"
                  onClick={() => {
                    addTrack(kind);
                    setMenuOpen(false);
                  }}
                >
                  {trackIcon(kind)} {kind} track
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: HEADER_W + contentWidth }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex h-7 border-b border-ink-700 bg-ink-800">
            <div className="sticky left-0 z-10 shrink-0 border-r border-ink-700 bg-ink-800" style={{ width: HEADER_W }} />
            <div
              ref={laneRef}
              className="relative flex-1 cursor-pointer select-none"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                seekFromEvent(e.clientX);
                const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
                  <div className="h-2 w-px bg-ink-500" />
                  <span className="ml-1 font-mono text-[9px] text-zinc-500">{formatDuration(t)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {tracks.map((track) => {
            const trackClips = clips
              .filter((c) => c.trackId === track.id)
              .sort((a, b) => a.start - b.start);

            return (
              <div key={track.id} className="flex border-b border-ink-700/70" style={{ height: 56 }}>
                <div
                  className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r border-ink-700 bg-ink-800 px-1.5"
                  style={{ width: HEADER_W }}
                >
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
                    {trackIcon(track.kind)}
                    <span className="truncate">{track.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      className="icon-btn h-5 w-5"
                      onClick={() => updateTrack(track.id, { muted: !track.muted })}
                      title="Mute track"
                    >
                      {track.muted ? <VolumeX size={11} className="text-red-400" /> : <Volume2 size={11} />}
                    </button>
                    <button
                      className="icon-btn h-5 w-5"
                      onClick={() => updateTrack(track.id, { locked: !track.locked })}
                      title="Lock track"
                    >
                      {track.locked ? <Lock size={11} className="text-amber-400" /> : <LockOpen size={11} />}
                    </button>
                    <button
                      className="icon-btn h-5 w-5"
                      onClick={() => removeTrack(track.id)}
                      title="Remove track"
                    >
                      <Minus size={11} />
                    </button>
                  </div>
                </div>

                <div
                  className={clsx(
                    'relative flex-1',
                    track.locked ? 'bg-ink-900/40' : 'bg-ink-900/20',
                    track.kind === 'audio' && 'bg-[#0c1a14]/40',
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, track)}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      selectClip(null);
                      seekFromEvent(e.clientX);
                    }
                  }}
                >
                  {/* grid */}
                  {ticks.map((t) => (
                    <div
                      key={t}
                      className="pointer-events-none absolute top-0 h-full w-px bg-white/[0.04]"
                      style={{ left: t * zoom }}
                    />
                  ))}

                  {trackClips.map((clip) => {
                    const asset = clip.assetId ? assets.find((a) => a.id === clip.assetId) : undefined;
                    const label = clip.text ? clip.text.text.replace(/\n/g, ' ') : asset?.name ?? 'Clip';
                    const selected = clip.id === selectedClipId;
                    return (
                      <div
                        key={clip.id}
                        className={clsx(
                          'timeline-clip group absolute top-1.5 flex h-[42px] items-stretch overflow-hidden rounded border bg-gradient-to-b text-[10px] shadow-sm',
                          clipColour(track.kind),
                          selected ? 'z-10 ring-2 ring-select ring-offset-0' : 'hover:brightness-110',
                        )}
                        style={{ left: clip.start * zoom, width: Math.max(8, clip.duration * zoom) }}
                        onPointerDown={(e) => {
                          if (track.locked) return;
                          beginDrag(e, clip, 'move');
                        }}
                        onDoubleClick={() => setPlayhead(clip.start)}
                        title={`${label} — ${formatDuration(clip.duration)}`}
                      >
                        <div
                          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 opacity-0 transition group-hover:opacity-100"
                          onPointerDown={(e) => beginDrag(e, clip, 'left')}
                        />
                        <div className="flex min-w-0 flex-1 flex-col justify-center px-2">
                          <span className="truncate font-medium text-white/95">{label}</span>
                          <span className="truncate text-[9px] text-white/60">
                            {formatDuration(clip.duration)}
                            {clip.speed !== 1 ? ` · ${clip.speed}×` : ''}
                            {clip.chroma.enabled ? ' · key' : ''}
                          </span>
                        </div>
                        <div
                          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 opacity-0 transition group-hover:opacity-100"
                          onPointerDown={(e) => beginDrag(e, clip, 'right')}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-accent"
            style={{ left: HEADER_W + playhead * zoom }}
          >
            <div className="absolute -left-[5px] top-0 h-2.5 w-[11px] rounded-b bg-accent" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-ink-700 px-3 py-1 text-[10px] text-zinc-600">
        <span>
          {tracks.length} tracks · {clips.length} clips · {formatDuration(duration)}
        </span>
        <span className="hidden sm:inline">Drag to move · edges to trim · Space to play</span>
      </div>
    </section>
  );
}
