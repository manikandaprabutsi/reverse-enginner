import type { EffectType, GeneratorType, TitleTemplate, TransitionType } from '../types';

export interface CatalogItem<T> {
  value: T;
  label: string;
  category: string;
}

export const TRANSITIONS: CatalogItem<TransitionType>[] = [
  { value: 'cross-dissolve', label: 'Cross Dissolve', category: 'Dissolve' },
  { value: 'fade', label: 'Cross Fade', category: 'Dissolve' },
  { value: 'additive-dissolve', label: 'Additive Dissolve', category: 'Dissolve' },
  { value: 'dip-to-color', label: 'Dip To Color Dissolve', category: 'Dissolve' },
  { value: 'center-wipe', label: 'Center Wipe', category: 'Wipe' },
  { value: 'clock-wipe', label: 'Clock Wipe', category: 'Wipe' },
  { value: 'edge-wipe', label: 'Edge Wipe', category: 'Wipe' },
  { value: 'wipe', label: 'Linear Wipe', category: 'Wipe' },
  { value: 'venetian-blind', label: 'Venetian Blind', category: 'Wipe' },
  { value: 'cross-iris', label: 'Cross Iris', category: 'Iris' },
  { value: 'diamond-iris', label: 'Diamond Iris', category: 'Iris' },
  { value: 'oval-iris', label: 'Oval Iris', category: 'Iris' },
  { value: '5-star', label: '5 Star', category: 'Shape' },
  { value: 'box', label: 'Box', category: 'Shape' },
  { value: 'heart', label: 'Heart', category: 'Shape' },
  { value: 'triangle-left', label: 'Triangle Left', category: 'Shape' },
  { value: 'triangle-right', label: 'Triangle Right', category: 'Shape' },
  { value: 'slide-left', label: 'Slide Left', category: 'Slide' },
  { value: 'slide-right', label: 'Slide Right', category: 'Slide' },
  { value: 'dip', label: 'Dip To Black', category: 'Dissolve' },
];

export const TITLES: CatalogItem<TitleTemplate>[] = [
  { value: 'basic', label: 'Basic Text', category: 'Titles' },
  { value: 'scroller', label: 'Scroller', category: 'Titles' },
  { value: 'lower-third-left', label: 'Lower Third Left', category: 'Lower Thirds' },
  { value: 'lower-third-middle', label: 'Lower Third Middle', category: 'Lower Thirds' },
  { value: 'lower-third-right', label: 'Lower Third Right', category: 'Lower Thirds' },
];

export const GENERATORS: CatalogItem<GeneratorType>[] = [
  { value: 'grey-scale', label: 'Grey Scale', category: 'Generators' },
  { value: 'ebu-bars', label: 'EBU Color Bar', category: 'Generators' },
  { value: 'smpte-bars', label: 'SMPTE Color Bar', category: 'Generators' },
  { value: 'ten-step', label: '10 Step', category: 'Generators' },
  { value: 'white', label: '100% White', category: 'Generators' },
  { value: 'window', label: 'Window', category: 'Generators' },
  { value: 'ycbcr-ramp', label: 'YCbCr Ramp', category: 'Generators' },
  { value: 'solid-color', label: 'Solid Color', category: 'Generators' },
];

export const EFFECTS: CatalogItem<EffectType>[] = [
  { value: 'color-generator', label: 'Color Generator', category: 'ResolveFX Generate' },
  { value: 'color-palette', label: 'Color Palette', category: 'ResolveFX Generate' },
  { value: 'grid', label: 'Grid', category: 'ResolveFX Generate' },
  { value: 'aperture-diffraction', label: 'Aperture Diffraction', category: 'ResolveFX Light' },
  { value: 'glow', label: 'Glow', category: 'ResolveFX Light' },
  { value: 'lens-flare', label: 'Lens Flare', category: 'ResolveFX Light' },
  { value: 'lens-reflections', label: 'Lens Reflections', category: 'ResolveFX Light' },
  { value: 'light-rays', label: 'Light Rays', category: 'ResolveFX Light' },
  { value: 'alpha-shrink-grow', label: 'Alpha Matte Shrink and Grow', category: 'ResolveFX Refine' },
  { value: 'beauty', label: 'Beauty', category: 'ResolveFX Refine' },
  { value: 'face-refinement', label: 'Face Refinement', category: 'ResolveFX Refine' },
  { value: 'blur', label: 'Blur', category: 'Blur' },
  { value: 'sharpen', label: 'Sharpen', category: 'Sharpen' },
  { value: 'glitch', label: 'Glitch', category: 'Stylize' },
  { value: 'vignette', label: 'Vignette', category: 'Stylize' },
  { value: 'grain', label: 'Film Grain', category: 'Stylize' },
];

export const EFFECT_LABELS: Record<string, string> = Object.fromEntries(
  EFFECTS.map((e) => [e.value, e.label]),
);

export const TRANSITION_LABELS: Record<string, string> = Object.fromEntries(
  TRANSITIONS.map((e) => [e.value, e.label]),
);
