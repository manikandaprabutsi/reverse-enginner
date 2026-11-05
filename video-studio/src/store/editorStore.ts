import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  type Clip,
  type MediaAsset,
  type Project,
  type ProjectSettings,
  type TextStyle,
  type Track,
  type TrackKind,
  type EffectType,
  type EffectInstance,
  type Keyframe,
  type GeneratorType,
  type TitleTemplate,
  type TransitionType,
  DEFAULT_AUDIO_FILTER,
  DEFAULT_CHROMA,
  DEFAULT_COLOR,
  DEFAULT_CURVES,
  DEFAULT_EFFECTS,
  DEFAULT_POWER_WINDOW,
  DEFAULT_TEXT,
  DEFAULT_TRANSFORM,
  DEFAULT_TRANSITION,
  DEFAULT_WHEELS,
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
  activePage: PageId;
  inspectorTab: InspectorTab;

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
  addGeneratorClip: (type: GeneratorType) => void;
  addTitleClip: (template: TitleTemplate) => void;
  setTransition: (clipId: string, type: TransitionType, duration?: number) => void;

  // effects + keyframes
  addEffect: (clipId: string, type: EffectType) => void;
  updateEffect: (clipId: string, effectId: string, patch: Partial<EffectInstance>) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  setClipLut: (clipId: string, lut: Clip['lut'] | null) => void;
  addKeyframe: (clipId: string) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;

  // editing operations
  rippleDelete: (id: string) => void;
  rollEdit: (id: string, delta: number) => void;
  slipClip: (id: string, delta: number) => void;
  slideClip: (id: string, delta: number) => void;

  // navigation
  setActivePage: (page: PageId) => void;
  setInspectorTab: (tab: InspectorTab) => void;

  // transport
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setZoom: (zoom: number) => void;
  selectClip: (id: string | null) => void;

  // project
  setSettings: (patch: Partial<ProjectSettings>) => void;
  setProjectName: (name: string) => void;
  loadProject: (project: Project) => void;
  reset: () => void;

  undo: () => void;
  redo: () => void;
}

export type PageId = 'media' | 'cut' | 'edit' | 'fusion' | 'color' | 'fairlight' | 'deliver';

export type InspectorTab = 'clip' | 'text' | 'color' | 'power' | 'fx' | 'audio' | 'captions' | 'export';

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
  wheels: structuredClone(DEFAULT_WHEELS),
  curves: structuredClone(DEFAULT_CURVES),
  windows: DEFAULT_WINDOWS,
  effectsList: [],
  audio: { ...DEFAULT_AUDIO_FILTER },
  keyframes: [],
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
      { id: 'v1', kind: 'video', name: 'V1', muted: false, solo: false, locked: false, volume: 1 },
      { id: 'a1', kind: 'audio', name: 'A1', muted: false, solo: false, locked: false, volume: 1 },
      { id: 't1', kind: 'text', name: 'T1', muted: false, solo: false, locked: false, volume: 1 },
    ],
    clips: [],
    settings: initialSettings,

    playhead: 0,
    playing: false,
    zoom: 60,
    selectedClipId: null,
    selectedAssetId: null,
    activePage: 'edit',
    inspectorTab: 'clip',

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
        solo: false,
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

    addGeneratorClip: (type) => {
      const state = get();
      const track = state.tracks.find((t) => t.kind === 'video' && !t.locked);
      if (!track) return;
      get().addClip({
        trackId: track.id,
        start: state.playhead,
        duration: 5,
        generator: type,
      });
    },

    addTitleClip: (template) => {
      const presets: Record<TitleTemplate, Partial<TextStyle>> = {
        basic: { fontSize: 64, x: 0.5, y: 0.5, align: 'center', background: 'transparent' },
        scroller: { fontSize: 48, x: 0.5, y: 0.5, align: 'center', animation: 'slide-up' },
        'lower-third-left': {
          fontSize: 44,
          x: 0.12,
          y: 0.82,
          align: 'left',
          background: 'rgba(0,0,0,0.55)',
          animation: 'slide-left',
        },
        'lower-third-middle': {
          fontSize: 44,
          x: 0.5,
          y: 0.82,
          align: 'center',
          background: 'rgba(0,0,0,0.55)',
          animation: 'fade',
        },
        'lower-third-right': {
          fontSize: 44,
          x: 0.88,
          y: 0.82,
          align: 'right',
          background: 'rgba(0,0,0,0.55)',
          animation: 'slide-right',
        },
      };
      get().addTextClip({ template, ...presets[template] });
    },

    setTransition: (clipId, type, duration) => {
      const clip = get().clips.find((c) => c.id === clipId);
      if (!clip) return;
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId
            ? { ...c, transitionIn: { type, duration: duration ?? c.transitionIn.duration } }
            : c,
        ),
      }));
    },

    addEffect: (clipId, type) => {
      const params: Record<EffectType, Record<string, number>> = {
        blur: { amount: 8 },
        sharpen: { amount: 0.5 },
        glitch: { amount: 0.4 },
        vignette: { amount: 0.6 },
        glow: { amount: 0.5 },
        grain: { amount: 0.35 },
        'light-rays': { amount: 0.5 },
        'lens-flare': { amount: 0.4 },
        'lens-reflections': { amount: 0.35 },
        'aperture-diffraction': { amount: 0.4 },
        'color-generator': { hue: 200 },
        grid: { size: 48 },
        beauty: { amount: 0.5 },
        'face-refinement': { amount: 0.5 },
        'alpha-shrink-grow': { amount: 0 },
        'color-palette': { hue: 0 },
      };
      const effect: EffectInstance = {
        id: nanoid(8),
        type,
        enabled: true,
        params: { ...(params[type] ?? { amount: 0.5 }) },
      };
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, effectsList: [...c.effectsList, effect] } : c,
        ),
      }));
    },

    updateEffect: (clipId, effectId, patch) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                effectsList: c.effectsList.map((e) => (e.id === effectId ? { ...e, ...patch } : e)),
              }
            : c,
        ),
      }));
    },

    removeEffect: (clipId, effectId) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId
            ? { ...c, effectsList: c.effectsList.filter((e) => e.id !== effectId) }
            : c,
        ),
      }));
    },

    setClipLut: (clipId, lut) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, lut: lut ?? undefined } : c,
        ),
      }));
    },

    addKeyframe: (clipId) => {
      const { clips, playhead } = get();
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      const t = Math.min(1, Math.max(0, (playhead - clip.start) / Math.max(0.001, clip.duration)));
      const kf: Keyframe = {
        id: nanoid(8),
        t,
        transform: { ...clip.transform },
        opacity: clip.transform.opacity,
      };
      const keyframes = [...clip.keyframes.filter((k) => Math.abs(k.t - t) > 0.005), kf].sort(
        (a, b) => a.t - b.t,
      );
      commit((s) => ({
        clips: s.clips.map((c) => (c.id === clipId ? { ...c, keyframes } : c)),
      }));
    },

    removeKeyframe: (clipId, keyframeId) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === clipId
            ? { ...c, keyframes: c.keyframes.filter((k) => k.id !== keyframeId) }
            : c,
        ),
      }));
    },

    rippleDelete: (id) => {
      const clip = get().clips.find((c) => c.id === id);
      if (!clip) return;
      commit((s) => ({
        clips: s.clips
          .filter((c) => c.id !== id)
          .map((c) =>
            c.trackId === clip.trackId && c.start >= clip.start + clip.duration - 0.001
              ? { ...c, start: c.start - clip.duration }
              : c,
          ),
        selectedClipId: s.selectedClipId === id ? null : s.selectedClipId,
      }));
    },

    rollEdit: (id, delta) => {
      const { clips } = get();
      const clip = clips.find((c) => c.id === id);
      if (!clip) return;
      const next = clips
        .filter((c) => c.trackId === clip.trackId && c.start >= clip.start + clip.duration - 0.06)
        .sort((a, b) => a.start - b.start)[0];
      if (!next) return;
      const d = Math.max(-clip.duration + 0.1, Math.min(next.duration - 0.1, delta));
      commit((s) => ({
        clips: s.clips.map((c) => {
          if (c.id === clip.id) return { ...c, duration: c.duration + d };
          if (c.id === next.id)
            return {
              ...c,
              start: c.start + d,
              duration: c.duration - d,
              inPoint: Math.max(0, c.inPoint + d * c.speed),
            };
          return c;
        }),
      }));
    },

    slipClip: (id, delta) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === id ? { ...c, inPoint: Math.max(0, c.inPoint + delta * c.speed) } : c,
        ),
      }));
    },

    slideClip: (id, delta) => {
      commit((s) => ({
        clips: s.clips.map((c) =>
          c.id === id ? { ...c, start: Math.max(0, c.start + delta) } : c,
        ),
      }));
    },

    setActivePage: (page) => set({ activePage: page }),
    setInspectorTab: (tab) => set({ inspectorTab: tab }),

    setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
    setPlaying: (playing) => set({ playing }),
    togglePlay: () => set((s) => ({ playing: !s.playing })),
    setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(8, zoom)) }),
    selectClip: (id) => set({ selectedClipId: id }),

    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    setProjectName: (name) => set({ name }),

    loadProject: (project) =>
      set({
        name: project.name,
        assets: project.assets,
        tracks:
          project.tracks.length > 0
            ? project.tracks
            : [
                { id: 'v1', kind: 'video', name: 'V1', muted: false, solo: false, locked: false, volume: 1 },
                { id: 'a1', kind: 'audio', name: 'A1', muted: false, solo: false, locked: false, volume: 1 },
              ],
        clips: project.clips,
        settings: project.settings,
        playhead: 0,
        playing: false,
        selectedClipId: null,
        selectedAssetId: null,
        past: [],
        future: [],
      }),

    reset: () =>
      set({
        assets: [],
        clips: [],
        tracks: [
          { id: 'v1', kind: 'video', name: 'V1', muted: false, solo: false, locked: false, volume: 1 },
          { id: 'a1', kind: 'audio', name: 'A1', muted: false, solo: false, locked: false, volume: 1 },
          { id: 't1', kind: 'text', name: 'T1', muted: false, solo: false, locked: false, volume: 1 },
        ],
        settings: get().settings,
        name: 'Untitled project',
        playhead: 0,
        playing: false,
        zoom: 60,
        selectedClipId: null,
        selectedAssetId: null,
        activePage: 'edit',
        inspectorTab: 'clip',
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
