import { useCallback, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Music, Plus, Trash2, Upload } from 'lucide-react';
import { useEditor } from '../store/editorStore';
import { importFile } from '../lib/media';
import { formatDuration } from '../lib/time';
import type { MediaAsset } from '../types';
import clsx from 'clsx';

export function MediaPanel({ className }: { className?: string }) {
  const assets = useEditor((s) => s.assets);
  const addAsset = useEditor((s) => s.addAsset);
  const removeAsset = useEditor((s) => s.removeAsset);
  const tracks = useEditor((s) => s.tracks);
  const clips = useEditor((s) => s.clips);
  const addClip = useEditor((s) => s.addClip);
  const selectAsset = useEditor((s) => s.selectAsset);
  const selectedAssetId = useEditor((s) => s.selectedAssetId);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const asset = await importFile(file);
          addAsset(asset);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setBusy(false);
      }
    },
    [addAsset],
  );

  const addToTimeline = (asset: MediaAsset) => {
    const kind = asset.kind === 'audio' ? 'audio' : 'video';
    const track = tracks.find((t) => t.kind === kind && !t.locked);
    if (!track) return;
    const trackEnd = clips
      .filter((c) => c.trackId === track.id)
      .reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    addClip({
      trackId: track.id,
      assetId: asset.id,
      start: trackEnd,
      duration: Math.min(asset.duration || 5, asset.kind === 'image' ? 5 : asset.duration),
      inPoint: 0,
      volume: asset.kind === 'audio' ? 1 : 1,
    });
  };

  return (
    <aside className={clsx('flex min-h-0 flex-col border-ink-700 bg-ink-850', className)}>
      <div className="panel-header">
        <span>Media pool</span>
        <span className="chip">{assets.length}</span>
      </div>

      <div className="p-2">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
          }}
          className={clsx(
            'flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-xs transition',
            dragging
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-ink-500 text-zinc-500 hover:border-ink-400 hover:text-zinc-300',
          )}
        >
          <Upload size={18} />
          <span className="font-medium">{busy ? 'Reading media…' : 'Import media'}</span>
          <span className="text-[10px] text-zinc-600">MP4, WebM, MOV, MP3, WAV, PNG, JPG</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {assets.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-zinc-600">
            Nothing imported yet. Files stay on this machine — nothing is uploaded.
          </p>
        )}

        <ul className="space-y-1.5">
          {assets.map((asset) => (
            <li key={asset.id}>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-asset-id', asset.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => {
                  selectAsset(asset.id);
                  addToTimeline(asset);
                }}
                className={clsx(
                  'group flex cursor-grab items-center gap-2 rounded-md border p-1.5 transition',
                  selectedAssetId === asset.id
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-ink-700 bg-ink-800 hover:border-ink-500',
                )}
                title="Drag to a track, or click to append"
              >
                <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-black">
                  {asset.thumbnail ? (
                    <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-600">
                      {asset.kind === 'audio' ? <Music size={16} /> : asset.kind === 'image' ? <ImageIcon size={16} /> : <Film size={16} />}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-zinc-200">{asset.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {asset.kind === 'image' ? 'still' : formatDuration(asset.duration)}
                    {asset.width ? ` · ${asset.width}×${asset.height}` : ''}
                  </p>
                </div>
                <button
                  className="icon-btn h-6 w-6 opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAsset(asset.id);
                  }}
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-ink-700 p-2">
        <button className="btn w-full" onClick={() => inputRef.current?.click()}>
          <Plus size={13} /> Add media
        </button>
      </div>
    </aside>
  );
}
