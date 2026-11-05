import { useMemo, useState } from 'react';
import { Clapperboard, Search, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';
import { EFFECTS, GENERATORS, TITLES, TRANSITIONS } from '../lib/catalog';

type LibraryTab = 'transitions' | 'titles' | 'generators' | 'effects';

const tabLabels: { id: LibraryTab; label: string }[] = [
  { id: 'transitions', label: 'Transitions' },
  { id: 'titles', label: 'Titles' },
  { id: 'generators', label: 'Generators' },
  { id: 'effects', label: 'OpenFX' },
];

export function EffectsPanel({ className }: { className?: string }) {
  const [tab, setTab] = useState<LibraryTab>('transitions');
  const [query, setQuery] = useState('');
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const addTitleClip = useEditor((s) => s.addTitleClip);
  const addGeneratorClip = useEditor((s) => s.addGeneratorClip);
  const addEffect = useEditor((s) => s.addEffect);
  const setTransition = useEditor((s) => s.setTransition);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = <T extends { label: string; category: string }>(items: T[]) =>
      q ? items.filter((i) => `${i.label} ${i.category}`.toLowerCase().includes(q)) : items;

    if (tab === 'transitions') return groupBy(filter(TRANSITIONS));
    if (tab === 'titles') return groupBy(filter(TITLES));
    if (tab === 'generators') return groupBy(filter(GENERATORS));
    return groupBy(filter(EFFECTS));
  }, [tab, query]);

  const apply = (value: string) => {
    if (tab === 'titles') addTitleClip(value as never);
    else if (tab === 'generators') addGeneratorClip(value as never);
    else if (tab === 'effects') {
      if (!selectedClipId) return;
      addEffect(selectedClipId, value as never);
      setInspectorTab('fx');
    } else if (selectedClipId) {
      setTransition(selectedClipId, value as never);
      setInspectorTab('clip');
    }
  };

  const disabled = (tab === 'transitions' || tab === 'effects') && !selectedClipId;

  return (
    <section className={clsx('flex min-h-0 flex-col border-t border-ink-700 bg-ink-850', className)}>
      <div className="panel-header">
        <span>Effects library</span>
        <span className="chip">ResolveFX</span>
      </div>

      <div className="grid grid-cols-4 gap-0.5 border-b border-ink-700 px-1.5 py-1">
        {tabLabels.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'rounded px-1 py-1 text-[9px] font-medium transition',
              tab === t.id ? 'bg-ink-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative border-b border-ink-700 p-1.5">
        <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search effects…"
          className="field w-full pl-6 text-[11px]"
        />
      </div>

      {disabled && (
        <p className="border-b border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[9px] text-amber-500/90">
          Select a timeline clip first.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map(([category, items]) => (
          <div key={category} className="mb-2">
            <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              {category}
            </p>
            <div className="grid gap-0.5">
              {items.map((item) => (
                <button
                  key={item.value}
                  disabled={disabled}
                  onClick={() => apply(item.value)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 transition hover:bg-ink-750 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tab === 'transitions' ? (
                    <Clapperboard size={11} className="shrink-0 text-zinc-500" />
                  ) : tab === 'titles' ? (
                    <span className="w-[11px] shrink-0 text-center font-serif text-[11px] leading-none text-zinc-500">
                      T
                    </span>
                  ) : (
                    <Wand2 size={11} className="shrink-0 text-zinc-500" />
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-8 text-zinc-600">
            <Sparkles size={16} />
            <p className="text-[10px]">No matching items</p>
          </div>
        )}
      </div>
    </section>
  );
}

function groupBy<T extends { label: string; category: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return [...map.entries()];
}
