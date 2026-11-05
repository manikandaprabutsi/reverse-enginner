/** Core domain model for the editor. */

export type AssetKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  kind: AssetKind;
  /** seconds */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  thumbnail?: string;
  file: File;
}

export type TrackKind = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  /** per-track gain (1 = unity), used for mixing down to the master */
  volume: number;
  /** -1 = hard left, 0 = centre, 1 = hard right */
  pan?: number;
}

export interface Transform {
  x: number; // -1..1 relative offset from centre
  y: number;
  scale: number; // 1 = fit
  rotation: number; // degrees
  opacity: number; // 0..1
  fit: 'contain' | 'cover' | 'stretch';
  flipX: boolean;
  flipY: boolean;
  /** crop fractions per edge, 0..0.45 */
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
}

/** -1..1 per channel, 0 = neutral. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Resolve-style primary grade wheels + temperature/tint. */
export interface ColorWheels {
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  offset: RGB;
  /** -100..100 */
  temperature: number;
  /** -100..100 */
  tint: number;
  /** 0..1 */
  pivot: number;
  /** 0..1 how strongly the grade blends into the original */
  lumaMix: number;
  /** Custom colour soft-clip controls, 0..1 normalised. */
  low: number;
  lowSoft: number;
  high: number;
  highSoft: number;
  softClip: boolean;
}

export interface Lut3D {
  name: string;
  size: number;
  /** size^3 * 3 floats in 0..1, blue-fastest (DaVinci/.cube order) */
  data: number[];
}

export interface CurvePoint {
  /** 0..1 input */
  x: number;
  /** 0..1 output */
  y: number;
}

export interface Curves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export type GeneratorType =
  | 'none'
  | 'grey-scale'
  | 'ebu-bars'
  | 'smpte-bars'
  | 'ten-step'
  | 'white'
  | 'window'
  | 'ycbcr-ramp'
  | 'solid-color';

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
  /** Render as a parallel branch in the node graph. */
  parallel?: boolean;
}

export interface AudioFilter {
  /** dB, -12..12 */
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  /** 0..1 */
  noiseReduction: number;
  /** 0..1 */
  voiceEnhance: number;
  /** semitones, -12..12 */
  pitch: number;
}

export interface Keyframe {
  id: string;
  /** normalised progress through the clip, 0..1 */
  t: number;
  transform: Partial<Transform>;
  opacity?: number;
}

export interface ColorAdjust {
  brightness: number; // 1 default
  contrast: number;
  saturation: number;
  hue: number; // degrees
  blur: number; // px
  sepia: number; // 0..1
  grayscale: number; // 0..1
}

/** A Resolve-style localised correction window (PowerWindow). */
export interface PowerWindow {
  id: string;
  name: string;
  enabled: boolean;
  /** normalised position on the frame: 0..1 */
  x: number;
  /** normalised position on the frame: 0..1 */
  y: number;
  /** normalised width of the window: 0..1 */
  w: number;
  /** normalised height of the window: 0..1 */
  h: number;
  opacity: number; // 0..1
  settings: ColorAdjust;
  /** Blend mode for the window effect */
  blend: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
  /** Invert mode: when true, grades the area outside the window */
  invert: boolean;
}

export interface ChromaKey {
  enabled: boolean;
  color: string; // hex
  similarity: number; // 0..1
  blend: number; // 0..1
  spill: number; // 0..1
}

export type TransitionType =
  | 'none'
  | 'fade'
  | 'dip'
  | 'slide-left'
  | 'slide-right'
  | 'wipe'
  | 'cross-dissolve'
  | 'additive-dissolve'
  | 'dip-to-color'
  | 'center-wipe'
  | 'clock-wipe'
  | 'edge-wipe'
  | 'venetian-blind'
  | 'cross-iris'
  | 'diamond-iris'
  | 'oval-iris'
  | '5-star'
  | 'box'
  | 'heart'
  | 'triangle-left'
  | 'triangle-right';

export interface Transition {
  type: TransitionType;
  duration: number; // seconds
}

export type TextAnimation = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'typewriter';

export type TitleTemplate =
  | 'basic'
  | 'scroller'
  | 'lower-third-left'
  | 'lower-third-middle'
  | 'lower-third-right';

export interface TextStyle {
  text: string;
  fontFamily: string;
  fontSize: number; // px at 1080p reference
  color: string;
  background: string; // rgba or 'transparent'
  align: 'left' | 'center' | 'right';
  x: number; // 0..1 normalised
  y: number; // 0..1
  bold: boolean;
  italic: boolean;
  animation: TextAnimation;
  template?: TitleTemplate;
}

export type EffectType =
  | 'blur'
  | 'sharpen'
  | 'glitch'
  | 'vignette'
  | 'glow'
  | 'grain'
  | 'light-rays'
  | 'lens-flare'
  | 'lens-reflections'
  | 'aperture-diffraction'
  | 'color-generator'
  | 'grid'
  | 'beauty'
  | 'face-refinement'
  | 'alpha-shrink-grow'
  | 'color-palette';

export interface ClipEffects {
  fadeIn: number; // seconds
  fadeOut: number;
  zoom: number; // 1 = none, >1 slow push in
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string | null;
  /** position on the timeline, seconds */
  start: number;
  /** visible length on the timeline, seconds */
  duration: number;
  /** offset into the source media, seconds */
  inPoint: number;
  speed: number;
  volume: number;
  muted: boolean;
  transform: Transform;
  color: ColorAdjust;
  wheels: ColorWheels;
  curves: Curves;
  /** Resolve-style localised correction windows, painted over the global grade. */
  windows: PowerWindow[];
  /** OpenFX / ResolveFX stack, applied in order. */
  effectsList: EffectInstance[];
  audio: AudioFilter;
  /** transform keyframes, sorted by t */
  keyframes: Keyframe[];
  chroma: ChromaKey;
  effects: ClipEffects;
  transitionIn: Transition;
  /** imported .cube 3D LUT applied after the primary grade. */
  lut?: Lut3D;
  /** synthetic source for generators (color bars, ramps, solid colours). */
  generator?: GeneratorType;
  text?: TextStyle;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface Project {
  name: string;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  settings: ProjectSettings;
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  preset: 'ultrafast' | 'fast' | 'medium';
  format: 'mp4' | 'webm' | 'mov';
  codec: 'h264' | 'h265';
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: 'contain',
  flipX: false,
  flipY: false,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
};

export const DEFAULT_COLOR: ColorAdjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
};

const NEUTRAL_RGB: RGB = { r: 0, g: 0, b: 0 };

export const DEFAULT_WHEELS: ColorWheels = {
  lift: { ...NEUTRAL_RGB },
  gamma: { ...NEUTRAL_RGB },
  gain: { ...NEUTRAL_RGB },
  offset: { ...NEUTRAL_RGB },
  temperature: 0,
  tint: 0,
  pivot: 0.435,
  lumaMix: 1,
  low: 0,
  lowSoft: 0,
  high: 1,
  highSoft: 0,
  softClip: false,
};

export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const DEFAULT_CURVES: Curves = {
  master: IDENTITY_CURVE.map((p) => ({ ...p })),
  red: IDENTITY_CURVE.map((p) => ({ ...p })),
  green: IDENTITY_CURVE.map((p) => ({ ...p })),
  blue: IDENTITY_CURVE.map((p) => ({ ...p })),
};

export const DEFAULT_AUDIO_FILTER: AudioFilter = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  noiseReduction: 0,
  voiceEnhance: 0,
  pitch: 0,
};

export const DEFAULT_POWER_WINDOW: PowerWindow = {
  id: 'window',
  name: 'Window 1',
  enabled: true,
  x: 0.5,
  y: 0.5,
  w: 0.4,
  h: 0.4,
  opacity: 1,
  settings: { ...DEFAULT_COLOR, brightness: 1.15 },
  blend: 'normal',
  invert: false,
};

export const DEFAULT_CHROMA: ChromaKey = {
  enabled: false,
  color: '#00b140',
  similarity: 0.28,
  blend: 0.08,
  spill: 0.1,
};

export const DEFAULT_EFFECTS: ClipEffects = {
  fadeIn: 0,
  fadeOut: 0,
  zoom: 1,
};

export const DEFAULT_WINDOWS: PowerWindow[] = [];

export const DEFAULT_TRANSITION: Transition = {
  type: 'none',
  duration: 0.5,
};

export const DEFAULT_TEXT: TextStyle = {
  text: 'Your text here',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 64,
  color: '#ffffff',
  background: 'transparent',
  align: 'center',
  x: 0.5,
  y: 0.5,
  bold: true,
  italic: false,
  animation: 'fade',
};

export const RESOLUTIONS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4K UHD': { width: 3840, height: 2160 },
  'Vertical 1080': { width: 1080, height: 1920 },
} as const;
