import { useMemo } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';

export function AudioMixer({ className }: { className?: string }) {
  const tracks = useEditor((s) => s.tracks);
  const clips = useEditor((s) => s.clips);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const updateTrack = useEditor((s) => s.updateTrack);
  const addTrack = useEditor((s) => s.addTrack);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);

  const audioTracks = tracks.filter((t) => t.kind === 'audio' || t.kind === 'video');
  const anySolo = audioTracks.some((t) => t.solo);

  const levels = useMemo(
    () =>
      audioTracks.map((track, i) => {
        if (!playing) return 0.04;
        const seed = Math.abs(Math.sin(playhead * (1.4 + i * 0.37) + i));
        const clipping = clips.some(
          (c) => c.trackId === track.id && playhead >= c.start && playhead < c.start + c.duration && !c.muted,
        );
        return clipping ? 0.18 + seed * 0.72 : 0.03;
      }),
    [audioTracks, playing, playhead, clips],
  );

  return (
    <section className={clsx('flex min-h-0 flex-col bg-[#0b0f12]', className)}>
      <div className="panel-header">
        <span>Fairlight audio mixer</span>
        <div className="flex items-center gap-1">
          <span className="chip">{audioTracks.length} channels</span>
          <button className="btn h-6" onClick={() => addTrack('audio')}>
            <Music size={11} /> Add track
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
        {audioTracks.map((track, index) => {
          const muted = track.muted || (anySolo && !track.solo);
          const seconds = clips.filter((c) => c.trackId === track.id).length;
          return (
            <div
              key={track.id}
              className="flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 p-2"
            >
              <span className="w-full truncate text-center text-[10px] font-semibold text-zinc-300">
                {track.name}
              </span>
              <span className="text-[8px] uppercase tracking-wider text-zinc-600">
                {track.kind === 'audio' ? 'Audio' : 'Video'} · {seconds}
              </span>

              <div className="flex items-end gap-1.5">
                <div className="relative h-24 w-4 overflow-hidden rounded-sm border border-ink-600 bg-black">
                  <div
                    className={clsx(
                      'absolute bottom-0 left-0 w-full transition-[height] duration-100',
                      levels[index] > 0.82 ? 'bg-red-500' : levels[index] > 0.6 ? 'bg-amber-400' : 'bg-emerald-500',
                    )}
                    style={{ height: `${Math.round((muted ? 0.02 : levels[index]) * 100)}%` }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-[18%] h-px bg-white/35" />
                  <div className="pointer-events-none absolute inset-x-0 top-[45%] h-px bg-white/20" />
                </div>
                <div className="flex h-24 items-center">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={track.volume}
                    onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                    className="h-3 w-20 -rotate-90 accent-[#4ade80]"
                    title={`${Math.round(track.volume * 100)}%`}
                  />
                </div>
              </div>
              <span className="font-mono text-[9px] text-zinc-500">
                {track.volume <= 0 ? '-∞' : `${(20 * Math.log10(track.volume)).toFixed(1)} dB`}
              </span>

              <div className="flex w-full items-center justify-between gap-1">
                <button
                  onClick={() => updateTrack(track.id, { muted: !track.muted })}
                  className={clsx(
                    'flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold transition',
                    track.muted ? 'bg-red-500/20 text-red-400' : 'bg-ink-700 text-zinc-400 hover:text-zinc-100',
                  )}
                  title="Mute"
                >
                  {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                </button>
                <button
                  onClick={() => updateTrack(track.id, { solo: !track.solo })}
                  className={clsx(
                    'flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold transition',
                    track.solo ? 'bg-amber-500/25 text-amber-300' : 'bg-ink-700 text-zinc-400 hover:text-zinc-100',
                  )}
                  title="Solo"
                >
                  S
                </button>
              </div>

              <div className="w-full">
                <span className="mb-0.5 block text-center text-[8px] uppercase text-zinc-600">Pan</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={track.pan ?? 0}
                  onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <button
                className="mt-auto w-full rounded bg-ink-800 px-1 py-1 text-[8px] text-zinc-500 transition hover:text-zinc-200"
                onClick={() => setInspectorTab('audio')}
              >
                EQ / FX
              </button>
            </div>
          );
        })}

        <div className="flex w-[92px] shrink-0 flex-col items-center justify-between rounded-lg border border-accent/30 bg-accent/5 p-2">
          <span className="text-[10px] font-semibold text-accent">Master</span>
          <div className="relative h-40 w-5 overflow-hidden rounded-sm border border-accent/30 bg-black">
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-emerald-500 via-amber-400 to-red-500 opacity-80" />
            <div className="absolute inset-x-0 top-[30%] h-px bg-white/60" />
          </div>
          <span className="font-mono text-[9px] text-zinc-500">0.0 dB</span>
          <span className="text-[8px] text-zinc-600">Stereo out</span>
        </div>
      </div>

      <p className="border-t border-ink-700 px-3 py-1.5 text-[9px] text-zinc-600">
        Solo overrides mute across all tracks. Clip EQ, noise reduction and voice enhancement live in the
        inspector&apos;s Audio tab and render on export.
      </p>
    </section>
  );
}
