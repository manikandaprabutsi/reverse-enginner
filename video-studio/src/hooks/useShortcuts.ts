import { useEffect } from 'react';
import { useEditor } from '../store/editorStore';

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/**
 * Single source of truth for editing shortcuts. Mounted once, in App,
 * so no two components race on the same key.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const s = useEditor.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        s.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (s.selectedClipId) s.duplicateClip(s.selectedClipId);
        return;
      }
      if (mod) return;

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          s.togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          s.setPlayhead(Math.max(0, s.playhead - (event.shiftKey ? 1 : 1 / s.settings.fps)));
          break;
        case 'ArrowRight':
          event.preventDefault();
          s.setPlayhead(s.playhead + (event.shiftKey ? 1 : 1 / s.settings.fps));
          break;
        case 'Home':
          event.preventDefault();
          s.setPlayhead(0);
          break;
        case 'End':
          event.preventDefault();
          s.setPlayhead(
            s.clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
          );
          break;
        case 'KeyS':
          s.splitAtPlayhead();
          break;
        case 'KeyM':
          s.mergeWithNext();
          break;
        case 'Delete':
        case 'Backspace':
          if (s.selectedClipId) {
            event.preventDefault();
            s.deleteClip(s.selectedClipId);
          }
          break;
        case 'Escape':
          s.selectClip(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / pause' },
  { keys: '← →', action: 'Step one frame' },
  { keys: 'Shift + ← →', action: 'Jump one second' },
  { keys: 'S', action: 'Split clip at playhead' },
  { keys: 'M', action: 'Merge with next clip' },
  { keys: 'Delete', action: 'Delete selected clip' },
  { keys: 'Ctrl + D', action: 'Duplicate clip' },
  { keys: 'Ctrl + Z', action: 'Undo' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo' },
  { keys: 'Home / End', action: 'Go to start / end' },
];
