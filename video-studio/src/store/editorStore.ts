import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  type Clip,
  type MediaAsset,
  type ProjectSettings,
  type TextStyle,
  type Track,
  type TrackKind,
  DEFAULT_CHROMA,
  DEFAULT_COLOR,
  DEFAULT_EFFECTS,
  DEFAULT_POWER_WINDOW,
  DEFAULT_TEXT,
  DEFAULT_TRANSFORM,
  DEFAULT_TRANSITION,
  DEFAULT_WINDOWS,
} from '../types';

export interface Snapshot {
  clips: Clip[];
  tracks: Track[];
}

interface EditorState {
  name: string;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  settings: ProjectSettings;

  playhead: number;
  playing: boolean;
  zoom: number; // pixels per second
  selectedClipId: string | null;
  selectedAssetId: string | null;

  past: Snapshot[];
  future: Snapshot[];

  // media
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (id: string) => void;
  selectAsset: (id: string | null) => void;

  // tracks
  addTrack: (kind: TrackKind) => string;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;

  // clips
  addClip: (partial: Partial<Clip> & { trackId: string }) => string | null;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  deleteClip: (id: string) => void;
  splitAtPlayhead: () => void;
  mergeWithNext: () => void;
  duplicateClip: (id: string) => void;
  addTextClip: (style?: Partial<TextStyle>) => void;
  addCaptionClips: (segments: { start: number; end: number; text: string }[]) => void;

  // transport
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setZoom: (zoom: number) => void;
  selectClip: (id: string | null) => void;

  // project
  setSettings: (patch: Partial<ProjectSettings>) => void;
  setProjectName: (name: string) => void;
  reset: () => void;

  undo: () => void;
  redo: () => void;
}

const initialSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: '#000000',
};

export const makeClip = (partial: Partial<Clip> & { trackId: string }): Clip => ({
  id: nanoid(8),
  assetId: null,
  start: 0,
  duration: 4,
  inPoint: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { ...DEFAULT_TRANSFORM },
  color: { ...DEFAULT_COLOR },
  windows: DEFAULT_WINDOWS,
  chroma: { ...DEFAULT_CHROMA },
  effects: { ...DEFAULT_EFFECTS },
  transitionIn: { ...DEFAULT_TRANSITION },
  ...partial,
});

export const useEditor = create<EditorState>((set, get) => {
  const snapshot = (): Snapshot => ({
    clips: get().clips.map((c) => ({ ...c })),
    tracks: get().tracks.map((t) => ({ ...t })),
  });

  const commit = (mutate: (state: EditorState) => Partial<EditorState>) => {
    const past = [...get().past, snapshot()].slice(-60);
    set({ ...mutate(get()), past, future: [] });
  };

  return {
    name: 'Untitled project',
    assets: [],
    tracks: [
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, volume: 1 },
      { id: 'a1', kind: 'audio', name: 'A1', muted: false, locked: false, volume: 1 },
      { id: 't1', kind: 'text', name: 'T1', muted: false, locked: false, volume: 1 },
    ],
    clips: [],
    settings: initialSettings,

    playhead: 0,
    playing: false,
    zoom: 60,
    selectedClipId: null,
    selectedAssetId: null,

    past: [],
    future: [],

    addAsset: (asset) => set((s) => ({ assets: [...s.assets, asset] })),
    removeAsset: (id) =>
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== id),
        clips: s.clips.filter((c) => c.assetId !== id),
      })),
    selectAsset: (id) => set({ selectedAssetId: id }),

    addTrack: (kind) => {
      const state = get();
      const sameKind = state.tracks.filter((t) => t.kind === kind);
      const prefix = kind === 'video' ? 'v' : kind === 'audio' ? 'a' : 't';
      const id = `${prefix}${Date.now().toString(36)}`;
      const track: Track = {
        id,
        kind,
        name: `${prefix.toUpperCase()}${sameKind.length + 1}`,
        muted: false,
        locked: false,
        volume: 1,
      };
      const tracks = [...state.tracks];
      const lastIndex = tracks.map((t) => t.kind).lastIndexOf(kind);
      tracks.splice(lastIndex + 1, 0, track);
      commit(() => ({ tracks }));
      return id;
    },

    updateTrack: (id, patch) =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

    removeTrack: (id) =>
      commit((s) => ({
        tracks: s.tracks.filter((t) => t.id !== id),
        clips: s.clips.filter((c) => c.trackId !== id),
      })),

    addClip: (partial) => {
      const track = get().tracks.find((t) => t.id === partial.trackId);
      if (!track || track.locked) return null;
      const clip = makeClip(partial);
      commit((s) => ({ clips: [...s.clips, clip] }));
      set({ selectedClipId: clip.id });
      return clip.id;
    },

    updateClip: (id, patch) =>
      set((s) => ({
        clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),

    deleteClip: (id) =>
      commit((s) => ({
        clips: s.clips.filter((c) => c.id !== id),
        selectedClipId: s.selectedClipId === id ? null : s.selectedClipId,
      })),

    splitAtPlayhead: () => {
      const { clips, playhead, selectedClipId, tracks } = get();
      const target = clips.find(
        (c) =>
          (selectedClipId ? c.id === selectedClipId : true) &&
          playhead > c.start + 0.05 &&
          playhead < c.start + c.duration - 0.05,
      );
      if (!target) return;
      const track = tracks.find((t) => t.id === target.trackId);
      if (!track || track.locked) return;

      const leftDuration = playhead - target.start;
      const rightDuration = target.duration - leftDuration;
      const left: Clip = { ...target, duration: leftDuration };
      const right: Clip = {
        ...target,
        id: nanoid(8),
        start: playhead,
        duration: rightDuration,
        inPoint: target.inPoint + leftDuration * target.speed,
        transitionIn: { ...DEFAULT_TRANSITION },
      };
      commit((s) => ({ clips: [...s.clips.filter((c) => c.id !== target.id), left, right] }));
      set({ selectedClipId: right.id });
    },

    mergeWithNext: () => {
      const { clips, selectedClipId } = get();
      if (!selectedClipId) return;
      const clip = clips.find((c) => c.id === selectedClipId);
      if (!clip) return;
      const next = clips
        .filter(
          (c) =>
            c.id !== clip.id &&
            c.trackId === clip.trackId &&
            c.assetId === clip.assetId &&
            Math.abs(c.start - (clip.start + clip.duration)) < 0.06,
        )
        .sort((a, b) => a.start - b.start)[0];
      if (!next) return;
      const merged: Clip = { ...clip, duration: clip.duration + next.duration };
      commit((s) => ({ clips: [...s.clips.filter((c) => c.id !== clip.id && c.id !== next.id), merged] }));
      set({ selectedClipId: merged.id });
    },

    duplicateClip: (id) => {
      const clip = get().clips.find((c) => c.id === id);
      if (!clip) return;
      const copy: Clip = { ...clip, id: nanoid(8), start: clip.start + clip.duration };
      commit((s) => ({ clips: [...s.clips, copy] }));
      set({ selectedClipId: copy.id });
    },

    addTextClip: (style) => {
      const { tracks } = get();
      let textTrack = tracks.find((t) => t.kind === 'text');
      let trackId = textTrack?.id;
      if (!trackId) trackId = get().addTrack('text');
      const duration = 4;
      get().addClip({
        trackId,
        duration,
        start: get().playhead,
        text: { ...DEFAULT_TEXT, ...style },
      });
    },

    addCaptionClips: (segments) => {
      const { tracks } = get();
      let textTrack = tracks.find((t) => t.kind === 'text');
      let trackId = textTrack?.id;
      if (!trackId) trackId = get().addTrack('text');
      const clips = segments.map((seg) =>
        makeClip({
          trackId: trackId!,
          start: seg.start,
          duration: Math.max(0.4, seg.end - seg.start),
          text: {
            ...DEFAULT_TEXT,
            text: seg.text,
            fontSize: 48,
            y: 0.86,
            background: 'rgba(0,0,0,0.55)',
            animation: 'fade',
          },
        }),
      );
      commit((s) => ({ clips: [...s.clips, ...clips] }));
    },

    setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
    setPlaying: (playing) => set({ playing }),
    togglePlay: () => set((s) => ({ playing: !s.playing })),
    setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(8, zoom)) }),
    selectClip: (id) => set({ selectedClipId: id }),

    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    setProjectName: (name) => set({ name }),

    reset: () =>
      set({
        assets: [],
        clips: [],
        tracks: [
          { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, volume: 1 },
          { id: 'a1', kind: 'audio', name: 'A1', muted: false, locked: false, volume: 1 },
          { id: 't1', kind: 'text', name: 'T1', muted: false, locked: false, volume: 1 },
        ],
        settings: get().settings,
        name: 'Untitled project',
        playhead: 0,
        playing: false,
        zoom: 60,
        selectedClipId: null,
        selectedAssetId: null,
        past: [],
        future: [],
      }),

    undo: () => {
      const { past, future, clips, tracks } = get();
      if (!past.length) return;
      const previous = past[past.length - 1];
      set({
        clips: previous.clips,
        tracks: previous.tracks,
        past: past.slice(0, -1),
        future: [...future, { clips, tracks }],
      });
    },

    redo: () => {
      const { past, future, clips, tracks } = get();
      if (!future.length) return;
      const next = future[future.length - 1];
      set({
        clips: next.clips,
        tracks: next.tracks,
        past: [...past, { clips, tracks }],
        future: future.slice(0, -1),
      });
    },
  };
});

export const useProjectDuration = () =>
  useEditor((s) => s.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0));
