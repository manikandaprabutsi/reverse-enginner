import { useRef, useState } from 'react';
import { FileUp, Palette, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';
import { parseCubeLut } from '../lib/color';

/** Generate a small synthetic .cube LUT so presets work without a file. */
function presetLut(kind: 'warm' | 'cool' | 'mono' | 'teal') {
  const size = 17;
  const data: number[] = [];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let rr = r / (size - 1);
        let gg = g / (size - 1);
        let bb = b / (size - 1);
        if (kind === 'warm') {
          rr = Math.min(1, rr * 1.08 + 0.04);
          bb = Math.max(0, bb * 0.9);
        } else if (kind === 'cool') {
          rr = Math.max(0, rr * 0.92);
          bb = Math.min(1, bb * 1.09 + 0.03);
        } else if (kind === 'mono') {
          const l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
          rr = l;
          gg = l;
          bb = l;
        } else {
          rr = Math.min(1, rr * 0.94 + bb * 0.04);
          gg = Math.min(1, gg * 1.02);
          bb = Math.min(1, bb * 1.12 + 0.02);
        }
        data.push(rr, gg, bb);
      }
    }
  }
  return { name: `${kind[0].toUpperCase()}${kind.slice(1)} preset`, size, data };
}

export function LutPanel({ className }: { className?: string }) {
  const clips = useEditor((s) => s.clips);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const setClipLut = useEditor((s) => s.setClipLut);
  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const importCube = async (file: File) => {
    setError(null);
    try {
      const lut = parseCubeLut(await file.text(), file.name.replace(/\.cube$/i, ''));
      if (!lut) throw new Error('Invalid .cube file (needs LUT_3D_SIZE and matching entries)');
      if (!clip) throw new Error('Select a timeline clip first');
      setClipLut(clip.id, lut);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={clsx('flex h-full min-h-0 flex-col bg-ink-850', className)}>
      <div className="panel-header">
        <span>LUTs</span>
        <span className="chip">{clip?.lut ? 'Applied' : 'None'}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Import a Resolve/Adobe <span className="font-mono text-zinc-300">.cube</span> 3D LUT. It is applied
          after the primary grade in the preview and baked into exports via ffmpeg.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".cube,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importCube(file);
            e.target.value = '';
          }}
        />

        <button className="btn btn-accent w-full" onClick={() => inputRef.current?.click()} disabled={!clip}>
          <FileUp size={13} /> Import .cube LUT
        </button>

        {!clip && <p className="text-[10px] text-amber-500/90">Select a clip to apply a LUT.</p>}
        {error && <p className="text-[10px] text-red-400">{error}</p>}

        {clip?.lut && (
          <div className="rounded border border-ink-700 bg-ink-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-200">{clip.lut.name}</p>
                <p className="text-[9px] text-zinc-500">
                  {clip.lut.size}³ cube · {clip.lut.data.length / 3} points
                </p>
              </div>
              <button
                className="text-zinc-500 transition hover:text-red-400"
                onClick={() => setClipLut(clip.id, null)}
                title="Remove LUT"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-ink-700 pt-2">
          <p className="label">Built-in looks</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['warm', 'cool', 'mono', 'teal'] as const).map((kind) => (
              <button
                key={kind}
                disabled={!clip}
                className="flex items-center justify-center gap-1 rounded border border-ink-600 py-1.5 text-[10px] capitalize text-zinc-400 transition hover:border-accent/50 hover:text-zinc-100 disabled:opacity-40"
                onClick={() => clip && setClipLut(clip.id, presetLut(kind))}
              >
                <Palette size={11} /> {kind}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
