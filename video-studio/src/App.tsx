import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Clapperboard,
  FolderOpen,
  Keyboard,
  Loader2,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { MediaPanel } from './components/MediaPanel';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { useEditor } from './store/editorStore';
import { SHORTCUTS, useShortcuts } from './hooks/useShortcuts';
import { createDemoFile } from './lib/demo';
import { importFile } from './lib/media';

type MobilePanel = 'media' | 'inspector' | null;

export default function App() {
  useShortcuts();

  const name = useEditor((s) => s.name);
  const setProjectName = useEditor((s) => s.setProjectName);
  const settings = useEditor((s) => s.settings);
  const assets = useEditor((s) => s.assets);
  const clips = useEditor((s) => s.clips);
  const addAsset = useEditor((s) => s.addAsset);
  const addClip = useEditor((s) => s.addClip);
  const addTextClip = useEditor((s) => s.addTextClip);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const reset = useEditor((s) => s.reset);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const [panel, setPanel] = useState<MobilePanel>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadDemo = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const file = await createDemoFile(6);
      const asset = await importFile(file);
      if (!asset.duration || !Number.isFinite(asset.duration)) asset.duration = 6;
      addAsset(asset);

      const state = useEditor.getState();
      const track = state.tracks.find((t) => t.kind === 'video' && !t.locked);
      if (track) {
        const end = state.clips
          .filter((c) => c.trackId === track.id)
          .reduce((max, c) => Math.max(max, c.start + c.duration), 0);
        setPlayhead(end);
        addClip({
          trackId: track.id,
          assetId: asset.id,
          start: end,
          duration: Math.min(asset.duration, 6),
        });
      }

      setPlayhead(0);
      if (!state.clips.some((c) => c.text)) {
        addTextClip({ text: 'BUILT IN THE BROWSER', fontSize: 52, y: 0.78, animation: 'none' });
      }
      setPanel(null);
      setToast('Demo clip added — press Space to play, then Export in the inspector.');
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : String(err));
    } finally {
      setDemoBusy(false);
    }
  };

  const clipCount = clips.length;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-ink-900 text-zinc-200">
      {/* ---------------- top bar ---------------- */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-850 px-2 md:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-black">
            <Clapperboard size={16} />
          </div>
          <span className="hidden shrink-0 text-[13px] font-semibold tracking-tight text-zinc-100 md:block">
            Resolve&nbsp;Lite
          </span>
        </div>

        <div className="mx-1 hidden h-5 w-px shrink-0 bg-ink-600 md:block" />

        <input
          value={name}
          onChange={(e) => setProjectName(e.target.value)}
          spellCheck={false}
          aria-label="Project name"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-zinc-300 outline-none transition hover:border-ink-600 focus:border-accent/60 focus:bg-ink-900 md:max-w-[220px] md:flex-none"
        />

        <span className="hidden shrink-0 items-center gap-2 font-mono text-[10px] text-zinc-600 lg:flex">
          <span>
            {settings.width}×{settings.height}
          </span>
          <span className="text-ink-500">·</span>
          <span>{settings.fps} fps</span>
          <span className="text-ink-500">·</span>
          <span>
            {assets.length} media / {clipCount} clips
          </span>
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            className="btn btn-accent h-8 px-2.5"
            onClick={loadDemo}
            disabled={demoBusy}
            title="Generate a 6-second demo clip in the browser"
          >
            {demoBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span className="hidden sm:inline">{demoBusy ? 'Rendering…' : 'Demo clip'}</span>
          </button>

          <div className="mx-1 hidden h-5 w-px bg-ink-600 sm:block" />

          <button className="icon-btn hidden sm:inline-flex" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button className="icon-btn hidden sm:inline-flex" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={15} />
          </button>
          <button
            className="icon-btn hidden sm:inline-flex"
            onClick={() => {
              if (window.confirm('Clear the timeline, media pool and undo history?')) {
                reset();
                setToast('Project cleared');
              }
            }}
            title="New project"
          >
            <RotateCcw size={15} />
          </button>

          <button
            className="icon-btn lg:hidden"
            onClick={() => setPanel((p) => (p === 'media' ? null : 'media'))}
            title="Media pool"
          >
            <FolderOpen size={16} />
          </button>
          <button
            className="icon-btn lg:hidden"
            onClick={() => setPanel((p) => (p === 'inspector' ? null : 'inspector'))}
            title="Inspector"
          >
            <SlidersHorizontal size={16} />
          </button>

          <button className="icon-btn" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts">
            <Keyboard size={16} />
          </button>
        </div>
      </header>

      {demoError && (
        <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
          <span className="flex-1">Demo clip failed: {demoError}</span>
          <button className="icon-btn h-5 w-5" onClick={() => setDemoError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ---------------- workspace ---------------- */}
      <div className="flex min-h-0 flex-1">
        <MediaPanel className="hidden w-[250px] shrink-0 border-r lg:flex xl:w-[280px]" />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Preview />
          <Timeline className="h-[42%] min-h-[192px] shrink-0 md:h-[40%]" />
        </div>

        <div className="hidden w-[292px] shrink-0 border-l border-ink-700 lg:block xl:w-[330px]">
          <Inspector />
        </div>
      </div>

      {/* ---------------- mobile sheet ---------------- */}
      {panel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close panel"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPanel(null)}
          />
          <section className="absolute inset-x-0 bottom-0 top-[10%] flex flex-col overflow-hidden rounded-t-2xl border-t border-ink-600 bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {panel === 'media' ? 'Media pool' : 'Inspector'}
              </span>
              <button className="icon-btn h-7 w-7" onClick={() => setPanel(null)}>
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {panel === 'media' ? <MediaPanel className="flex h-full" /> : <Inspector />}
            </div>
          </section>
        </div>
      )}

      {/* ---------------- shortcuts ---------------- */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            aria-label="Close shortcuts"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-100">Keyboard shortcuts</h2>
              <button className="icon-btn h-7 w-7" onClick={() => setHelpOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-2">
              {SHORTCUTS.map((item) => (
                <li key={item.keys} className="flex items-center justify-between gap-3 rounded px-2 py-1.5">
                  <span className="text-[11px] text-zinc-400">{item.action}</span>
                  <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {item.keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="border-t border-ink-700 px-4 py-2.5 text-[10px] leading-relaxed text-zinc-600">
              Everything runs locally in your browser. Media never leaves this machine; exports render
              through FFmpeg compiled to WebAssembly.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- toast ---------------- */}
      <div
        className={clsx(
          'pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-ink-600 bg-ink-750/95 px-3.5 py-1.5 text-[11px] text-zinc-300 shadow-xl backdrop-blur transition',
          toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </div>
  );
}
