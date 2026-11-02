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
  locked: boolean;
}

export interface Transform {
  x: number; // -1..1 relative offset from centre
  y: number;
  scale: number; // 1 = fit
  rotation: number; // degrees
  opacity: number; // 0..1
  fit: 'contain' | 'cover' | 'stretch';
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

export interface ChromaKey {
  enabled: boolean;
  color: string; // hex
  similarity: number; // 0..1
  blend: number; // 0..1
  spill: number; // 0..1
}

export type TransitionType = 'none' | 'fade' | 'dip' | 'slide-left' | 'slide-right' | 'wipe';

export interface Transition {
  type: TransitionType;
  duration: number; // seconds
}

export type TextAnimation = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'typewriter';

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
}

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
  chroma: ChromaKey;
  effects: ClipEffects;
  transitionIn: Transition;
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
  format: 'mp4' | 'webm';
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: 'contain',
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
