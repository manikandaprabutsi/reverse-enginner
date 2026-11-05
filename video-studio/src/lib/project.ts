import type { Clip, MediaAsset, Project, Track } from '../types';
import {
  DEFAULT_AUDIO_FILTER,
  DEFAULT_CHROMA,
  DEFAULT_COLOR,
  DEFAULT_CURVES,
  DEFAULT_EFFECTS,
  DEFAULT_TEXT,
  DEFAULT_TRANSFORM,
  DEFAULT_TRANSITION,
  DEFAULT_WHEELS,
  DEFAULT_WINDOWS,
} from '../types';

const DB_NAME = 'resolve-lite';
const STORE = 'media';
const AUTOSAVE_KEY = 'resolve-lite:autosave';

const META_FIELDS = [
  'id',
  'name',
  'kind',
  'duration',
  'width',
  'height',
  'hasAudio',
  'thumbnail',
] as const;

type AssetMeta = Record<string, unknown> & { id: string; name: string };

interface SerializedProject {
  version: 1;
  savedAt: string;
  name: string;
  settings: Project['settings'];
  tracks: Project['tracks'];
  clips: Project['clips'];
  assets: AssetMeta[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function idbPut(key: string, value: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await openDb();
  const value = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

/** Persist media blobs so a reload can restore the project without re-importing. */
export async function persistAssets(assets: MediaAsset[]): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      try {
        await idbPut(asset.id, asset.file);
      } catch {
        /* storage quota — the JSON still saves without media */
      }
    }),
  );
}

export function serialiseProject(project: Project): SerializedProject {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    name: project.name,
    settings: project.settings,
    tracks: project.tracks,
    clips: project.clips,
    assets: project.assets.map((asset) => {
      const meta: AssetMeta = { id: asset.id, name: asset.name };
      for (const field of META_FIELDS) {
        const v = asset[field];
        if (v !== undefined && v !== null) Object.assign(meta, { [field]: v });
      }
      return meta;
    }),
  };
}

export function normaliseClip(clip: Clip): Clip {
  return {
    ...clip,
    transform: { ...DEFAULT_TRANSFORM, ...clip.transform },
    color: { ...DEFAULT_COLOR, ...clip.color },
    wheels: { ...DEFAULT_WHEELS, ...clip.wheels },
    curves: { ...DEFAULT_CURVES, ...clip.curves },
    windows: clip.windows ?? DEFAULT_WINDOWS,
    effectsList: clip.effectsList ?? [],
    audio: { ...DEFAULT_AUDIO_FILTER, ...clip.audio },
    keyframes: clip.keyframes ?? [],
    chroma: { ...DEFAULT_CHROMA, ...clip.chroma },
    effects: { ...DEFAULT_EFFECTS, ...clip.effects },
    transitionIn: { ...DEFAULT_TRANSITION, ...clip.transitionIn },
    text: clip.text ? { ...DEFAULT_TEXT, ...clip.text } : clip.text,
  };
}

function normaliseTrack(track: Track): Track {
  return { ...track, solo: false };
}

async function hydrate(data: SerializedProject): Promise<{ project: Project; missing: number }> {
  const metas = [...(data.assets ?? [])] as unknown as MediaAsset[];
  const assets: MediaAsset[] = [];
  let missing = 0;

  for (const meta of metas) {
    const blob = await idbGet(meta.id).catch(() => null);
    if (!blob) {
      missing++;
      continue;
    }
    const file = new File([blob], meta.name, { type: blob.type || 'application/octet-stream' });
    const url = URL.createObjectURL(file);
    assets.push({
      ...meta,
      url,
      file,
      thumbnail: meta.thumbnail && meta.thumbnail.startsWith('blob:') ? url : meta.thumbnail,
    });
  }

  const assetIds = new Set(assets.map((a) => a.id));
  const clips = (data.clips ?? [])
    .map(normaliseClip)
    .filter((clip) => !clip.assetId || assetIds.has(clip.assetId));

  return {
    project: {
      name: data.name ?? 'Untitled project',
      settings: data.settings,
      tracks: (data.tracks ?? []).map(normaliseTrack),
      clips,
      assets,
    },
    missing,
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveProjectFile(project: Project): Promise<string> {
  await persistAssets(project.assets);
  const json = JSON.stringify(serialiseProject(project), null, 2);
  const filename = `${(project.name || 'untitled').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.resolve-lite.json`;
  download(new Blob([json], { type: 'application/json' }), filename);
  return filename;
}

export async function openProjectFile(file: File): Promise<{ project: Project; missing: number }> {
  const data = JSON.parse(await file.text()) as SerializedProject;
  if (!data || data.version !== 1) throw new Error('Not a Resolve Lite project file');
  return hydrate(data);
}

export function autosaveProject(project: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialiseProject(project)));
  } catch {
    /* quota */
  }
  void persistAssets(project.assets).catch(() => undefined);
}

export async function loadAutosave(): Promise<{ project: Project; missing: number } | null> {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return await hydrate(JSON.parse(raw) as SerializedProject);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}
