import {
  BookOpen,
  Clapperboard,
  Columns3,
  Film,
  FolderOpen,
  Gauge,
  Image,
  Library,
  ListVideo,
  Palette,
  Scissors,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { useEditor, type PageId } from '../store/editorStore';

export type ToolId =
  | 'gallery'
  | 'luts'
  | 'media'
  | 'timeline'
  | 'clips'
  | 'nodes'
  | 'openfx'
  | 'lightbox'
  | 'library'
  | 'settings';

const PAGES: { id: PageId; label: string; icon: typeof Film; hint: string }[] = [
  { id: 'media', label: 'Media', icon: FolderOpen, hint: 'Media pool, bins and smart bins' },
  { id: 'cut', label: 'Cut', icon: Scissors, hint: 'Fast assembly and trimming' },
  { id: 'edit', label: 'Edit', icon: Columns3, hint: 'Multitrack editing and effects' },
  { id: 'fusion', label: 'Fusion', icon: Sparkles, hint: 'Node-based compositing' },
  { id: 'color', label: 'Color', icon: Palette, hint: 'Wheels, curves, scopes and LUTs' },
  { id: 'fairlight', label: 'Fairlight', icon: SlidersHorizontal, hint: 'Audio mixing and cleanup' },
  { id: 'deliver', label: 'Deliver', icon: Gauge, hint: 'Render and export' },
];

const TOOLS: { id: ToolId; label: string; icon: typeof Film }[] = [
  { id: 'gallery', label: 'Gallery', icon: Image },
  { id: 'luts', label: 'LUTs', icon: Palette },
  { id: 'media', label: 'Media Pool', icon: FolderOpen },
  { id: 'timeline', label: 'Timeline', icon: ListVideo },
  { id: 'clips', label: 'Clips', icon: Film },
  { id: 'nodes', label: 'Nodes', icon: Columns3 },
  { id: 'openfx', label: 'OpenFX', icon: Wand2 },
  { id: 'lightbox', label: 'Lightbox', icon: Sparkles },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function PageNav({
  onTool,
  onSave,
  onOpen,
}: {
  onTool: (tool: ToolId) => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const activePage = useEditor((s) => s.activePage);
  const setActivePage = useEditor((s) => s.setActivePage);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);

  const openPage = (page: PageId) => {
    setActivePage(page);
    if (page === 'color') setInspectorTab('color');
    else if (page === 'fusion') setInspectorTab('fx');
    else if (page === 'fairlight') setInspectorTab('audio');
    else if (page === 'deliver') setInspectorTab('export');
  };

  return (
    <nav className="flex shrink-0 flex-col border-b border-ink-700 bg-ink-850">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-2 py-1 [scrollbar-width:none]">
        {PAGES.map((page) => (
          <button
            key={page.id}
            onClick={() => openPage(page.id)}
            title={page.hint}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1.5 text-[11px] font-medium transition',
              activePage === page.id
                ? 'border-accent bg-ink-800 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:bg-ink-800/60 hover:text-zinc-300',
            )}
          >
            <page.icon size={13} />
            {page.label}
          </button>
        ))}

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <button className="btn h-7" onClick={onOpen} title="Open project (.resolve-lite.json)">
            Open
          </button>
          <button className="btn btn-accent h-7" onClick={onSave} title="Save project as JSON">
            Save
          </button>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-t border-ink-700/60 bg-ink-900/70 px-2 py-1 [scrollbar-width:none]">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onTool(tool.id)}
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-500 transition hover:bg-ink-800 hover:text-zinc-200"
          >
            <tool.icon size={11} />
            {tool.label}
          </button>
        ))}
        <span className="ml-auto flex shrink-0 items-center gap-1 pr-1 text-[9px] text-zinc-700">
          <Clapperboard size={10} /> Resolve Lite workspace
        </span>
      </div>
    </nav>
  );
}
