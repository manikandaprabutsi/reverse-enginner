import { useMemo, useState } from 'react';
import { ArrowRight, CircleDot, GitBranch, Plus, Trash2, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';
import { EFFECTS, EFFECT_LABELS } from '../lib/catalog';
import type { EffectType } from '../types';

export function NodeEditor({ className }: { className?: string }) {
  const clips = useEditor((s) => s.clips);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const updateClip = useEditor((s) => s.updateClip);
  const addEffect = useEditor((s) => s.addEffect);
  const updateEffect = useEditor((s) => s.updateEffect);
  const removeEffect = useEditor((s) => s.removeEffect);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);
  const [open, setOpen] = useState(false);

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;

  const serial = useMemo(() => (clip?.effectsList ?? []).filter((e) => !e.parallel), [clip]);
  const parallel = useMemo(() => (clip?.effectsList ?? []).filter((e) => e.parallel), [clip]);

  if (!clip) {
    return (
      <div className={clsx('flex h-full items-center justify-center bg-[#0b0d10] p-4', className)}>
        <p className="text-xs text-zinc-500">Select a clip to edit its node graph.</p>
      </div>
    );
  }

  return (
    <section className={clsx('flex min-h-0 flex-col bg-[#0b0d10]', className)}>
      <div className="panel-header">
        <span>Node editor</span>
        <div className="flex items-center gap-1">
          <span className="chip">Serial</span>
          <span className="chip">{parallel.length} parallel</span>
          <div className="relative">
            <button className="btn h-6" onClick={() => setOpen((v) => !v)}>
              <Plus size={11} /> Node
            </button>
            {open && (
              <div className="absolute right-0 top-full z-40 mt-1 max-h-56 w-52 overflow-y-auto rounded-md border border-ink-600 bg-ink-750 shadow-xl">
                {EFFECTS.map((fx) => (
                  <button
                    key={fx.value}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-ink-700"
                    onClick={() => {
                      addEffect(clip.id, fx.value as EffectType);
                      setOpen(false);
                    }}
                  >
                    <Wand2 size={11} className="text-zinc-500" /> {fx.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex min-w-max items-center gap-1">
          <GraphNode
            title={clip.text ? 'Text' : clip.generator ? 'Generator' : 'Media In'}
            subtitle={clip.text ? clip.text.text.slice(0, 18) : clip.generator ?? 'Source'}
            tone="input"
            onClick={() => setInspectorTab(clip.text ? 'text' : 'clip')}
          />
          <Connector />
          <GraphNode
            title="Primary Grade"
            subtitle="Wheels · Curves"
            tone="grade"
            onClick={() => setInspectorTab('color')}
            active={clip.lut ? true : undefined}
          />
          <Connector />

          {serial.map((fx) => (
            <div key={fx.id} className="flex items-center gap-1">
              <GraphNode
                title={EFFECT_LABELS[fx.type] ?? fx.type}
                subtitle={fx.enabled ? 'Serial' : 'Bypassed'}
                tone={fx.enabled ? 'fx' : 'muted'}
                onClick={() => setInspectorTab('fx')}
                onToggle={() => updateEffect(clip.id, fx.id, { enabled: !fx.enabled })}
                onDelete={() => removeEffect(clip.id, fx.id)}
                onParallel={() => updateEffect(clip.id, fx.id, { parallel: true })}
              />
              <Connector />
            </div>
          ))}

          {parallel.length > 0 && (
            <>
              <div className="flex flex-col gap-1">
                <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-600">
                  <GitBranch size={10} /> Parallel
                </div>
                {parallel.map((fx) => (
                  <GraphNode
                    key={fx.id}
                    compact
                    title={EFFECT_LABELS[fx.type] ?? fx.type}
                    subtitle={fx.enabled ? 'Branch' : 'Bypassed'}
                    tone={fx.enabled ? 'fx' : 'muted'}
                    onClick={() => setInspectorTab('fx')}
                    onToggle={() => updateEffect(clip.id, fx.id, { enabled: !fx.enabled })}
                    onDelete={() => removeEffect(clip.id, fx.id)}
                    onParallel={() => updateEffect(clip.id, fx.id, { parallel: false })}
                  />
                ))}
              </div>
              <Connector />
            </>
          )}

          <GraphNode title="Output" subtitle="Timeline" tone="output" onClick={() => setInspectorTab('export')} />
        </div>

        <div className="mt-5 grid max-w-lg gap-2 text-[10px] text-zinc-500 sm:grid-cols-2">
          <div className="rounded border border-ink-700 bg-ink-800/60 p-2">
            <p className="mb-0.5 font-semibold text-zinc-400">Serial nodes</p>
            Processed top-to-bottom in order. Drag effects from the library to append.
          </div>
          <div className="rounded border border-ink-700 bg-ink-800/60 p-2">
            <p className="mb-0.5 font-semibold text-zinc-400">Parallel nodes</p>
            Branches render alongside the serial chain, like Resolve&apos;s parallel mixer.
          </div>
        </div>
      </div>
    </section>
  );
}

function Connector() {
  return <ArrowRight size={14} className="shrink-0 text-zinc-700" />;
}

function GraphNode({
  title,
  subtitle,
  tone,
  compact,
  onClick,
  onToggle,
  onDelete,
  onParallel,
  active,
}: {
  title: string;
  subtitle: string;
  tone: 'input' | 'grade' | 'fx' | 'output' | 'muted';
  compact?: boolean;
  onClick: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  onParallel?: () => void;
  active?: boolean;
}) {
  const toneClass: Record<string, string> = {
    input: 'border-sky-500/50 bg-sky-500/10',
    grade: 'border-amber-500/50 bg-amber-500/10',
    fx: 'border-emerald-500/50 bg-emerald-500/10',
    output: 'border-fuchsia-500/50 bg-fuchsia-500/10',
    muted: 'border-ink-600 bg-ink-800 opacity-60',
  };
  return (
    <div
      className={clsx(
        'group relative shrink-0 rounded-md border px-2.5 py-2 text-left transition hover:brightness-125',
        compact ? 'w-[108px]' : 'w-[124px]',
        toneClass[tone],
        active && 'ring-1 ring-accent',
      )}
    >
      <button onClick={onClick} className="block w-full text-left">
        <span className="block truncate text-[11px] font-semibold text-zinc-100">{title}</span>
        <span className="block truncate text-[9px] text-zinc-400">{subtitle}</span>
      </button>
      <CircleDot size={9} className="absolute right-1.5 top-1.5 text-white/25" />
      {(onToggle || onDelete || onParallel) && (
        <div className="absolute -bottom-5 left-0 z-10 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
          {onToggle && (
            <button
              className="rounded bg-ink-750 p-0.5 text-zinc-400 hover:text-zinc-100"
              onClick={onToggle}
              title="Bypass node"
            >
              <CircleDot size={10} />
            </button>
          )}
          {onParallel && (
            <button
              className="rounded bg-ink-750 p-0.5 text-zinc-400 hover:text-zinc-100"
              onClick={onParallel}
              title="Move to parallel branch"
            >
              <GitBranch size={10} />
            </button>
          )}
          {onDelete && (
            <button
              className="rounded bg-ink-750 p-0.5 text-zinc-400 hover:text-red-400"
              onClick={onDelete}
              title="Delete node"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
