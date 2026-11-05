import type { ColorWheels, CurvePoint, Curves, Lut3D, RGB } from '../types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Piecewise-linear curve sampling with a 256-entry LUT. */
export function sampleCurve(points: CurvePoint[], v: number): number {
  if (!points.length) return v;
  const sorted = points;
  if (v <= sorted[0].x) return sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (v <= b.x) {
      const span = Math.max(0.00001, b.x - a.x);
      const t = (v - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }
  return sorted[sorted.length - 1].y;
}

export function isIdentityCurve(points: CurvePoint[]): boolean {
  return (
    points.length === 2 &&
    Math.abs(points[0].x) < 1e-4 &&
    Math.abs(points[0].y) < 1e-4 &&
    Math.abs(points[1].x - 1) < 1e-4 &&
    Math.abs(points[1].y - 1) < 1e-4
  );
}

export function isNeutralRGB(c: RGB): boolean {
  return Math.abs(c.r) < 1e-4 && Math.abs(c.g) < 1e-4 && Math.abs(c.b) < 1e-4;
}

export function isNeutralWheels(w: ColorWheels | undefined): boolean {
  if (!w) return true;
  return (
    isNeutralRGB(w.lift) &&
    isNeutralRGB(w.gamma) &&
    isNeutralRGB(w.gain) &&
    isNeutralRGB(w.offset) &&
    Math.abs(w.temperature) < 1e-4 &&
    Math.abs(w.tint) < 1e-4 &&
    (w.lumaMix === undefined || Math.abs(w.lumaMix - 1) < 1e-4) &&
    !w.softClip &&
    Math.abs(w.low ?? 0) < 1e-4 &&
    Math.abs((w.high ?? 1) - 1) < 1e-4
  );
}

export function hasIdentityCurves(c: Curves | undefined): boolean {
  if (!c) return true;
  return (
    isIdentityCurve(c.master) &&
    isIdentityCurve(c.red) &&
    isIdentityCurve(c.green) &&
    isIdentityCurve(c.blue)
  );
}

/** True when the per-pixel LUT pass can be skipped. */
export function isGradeIdentity(wheels?: ColorWheels, curves?: Curves): boolean {
  return isNeutralWheels(wheels) && hasIdentityCurves(curves);
}

function wheelChannel(
  v: number,
  lift: number,
  gamma: number,
  gain: number,
  offset: number,
): number {
  let out = v;
  out += lift * (1 - out); // lift raises the toe
  out += gain * out; // gain scales the highlights
  if (Math.abs(gamma) > 1e-4) out = Math.pow(clamp01(out), 1 / (1 + gamma * 0.75));
  out += offset;
  return clamp01(out);
}

/**
 * Build 256-entry lookup tables for R/G/B from the wheels + curves.
 * This is applied per pixel on a working canvas in the preview.
 */
export function buildChannelLuts(wheels: ColorWheels, curves: Curves) {
  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const cr = sampleCurve(curves.red, v);
    const cg = sampleCurve(curves.green, v);
    const cb = sampleCurve(curves.blue, v);
    const cm = sampleCurve(curves.master, v);

    let rr = wheelChannel(cm * cr, wheels.lift.r, wheels.gamma.r, wheels.gain.r, wheels.offset.r);
    let gg = wheelChannel(cm * cg, wheels.lift.g, wheels.gamma.g, wheels.gain.g, wheels.offset.g);
    let bb = wheelChannel(cm * cb, wheels.lift.b, wheels.gamma.b, wheels.gain.b, wheels.offset.b);

    // Temperature: warm adds red, removes blue. Tint: green/magenta shift.
    const temp = (wheels.temperature ?? 0) / 100;
    const tint = (wheels.tint ?? 0) / 100;
    rr = clamp01(rr + temp * 0.18 + tint * 0.05);
    gg = clamp01(gg - tint * 0.12);
    bb = clamp01(bb - temp * 0.18 + tint * 0.05);

    // Custom soft clip: remap the low/high range before the luma mix.
    if (wheels.softClip) {
      const low = clamp01(wheels.low ?? 0);
      const high = clamp01(wheels.high ?? 1);
      const span = Math.max(0.001, high - low);
      const soft = clamp01(Math.max(wheels.lowSoft ?? 0, wheels.highSoft ?? 0));
      const remap = (v: number) => {
        let t = clamp01((v - low) / span);
        if (soft > 0) {
          const s = t * t * (3 - 2 * t);
          t = t + (s - t) * soft;
        }
        return t;
      };
      rr = remap(rr);
      gg = remap(gg);
      bb = remap(bb);
    }

    // Luma mix blends the graded result back toward the untouched source.
    const mix = Math.min(1, Math.max(0, wheels.lumaMix ?? 1));
    if (mix < 1) {
      rr = v + (rr - v) * mix;
      gg = v + (gg - v) * mix;
      bb = v + (bb - v) * mix;
    }

    r[i] = Math.round(clamp01(rr) * 255);
    g[i] = Math.round(clamp01(gg) * 255);
    b[i] = Math.round(clamp01(bb) * 255);
  }
  return { r, g, b };
}

/** Apply a parsed .cube LUT to an ImageData buffer in place (trilinear). */
export function applyLut3D(data: Uint8ClampedArray, lut: Lut3D) {
  const n = lut.size;
  if (!Number.isFinite(n) || n < 2 || lut.data.length < n * n * n * 3) return;
  const max = n - 1;
  const sample = (r: number, g: number, b: number) => {
    const ri = Math.min(max, Math.max(0, Math.round(r * max)));
    const gi = Math.min(max, Math.max(0, Math.round(g * max)));
    const bi = Math.min(max, Math.max(0, Math.round(b * max)));
    const idx = ((bi * n + gi) * n + ri) * 3;
    return [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]];
  };
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = sample(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    data[i] = clamp01(r) * 255;
    data[i + 1] = clamp01(g) * 255;
    data[i + 2] = clamp01(b) * 255;
  }
}

/** Parse Resolve/Adobe .cube 3D LUT text. */
export function parseCubeLut(text: string, name: string): Lut3D | null {
  let size = 0;
  const data: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1] ?? '0', 10);
      continue;
    }
    if (/^[A-Z_]/i.test(line)) continue; // TITLE, DOMAIN_MIN/MAX, etc.
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((v) => Number.isFinite(v))) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  if (!size || data.length !== size * size * size * 3) return null;
  return { name, size, data };
}

/** Apply the LUT to an ImageData buffer in place. */
export function applyLuts(data: Uint8ClampedArray, luts: { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray }) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = luts.r[data[i]];
    data[i + 1] = luts.g[data[i + 1]];
    data[i + 2] = luts.b[data[i + 2]];
  }
}

/** ffmpeg colour-balance string for the wheels. */
export function wheelsToFFmpeg(w: ColorWheels): string[] {
  const parts: string[] = [];
  if (!isNeutralWheels(w)) {
    const rs = w.lift.r.toFixed(3);
    const gs = w.lift.g.toFixed(3);
    const bs = w.lift.b.toFixed(3);
    const rm = w.gamma.r.toFixed(3);
    const gm = w.gamma.g.toFixed(3);
    const bm = w.gamma.b.toFixed(3);
    const rh = w.gain.r.toFixed(3);
    const gh = w.gain.g.toFixed(3);
    const bh = w.gain.b.toFixed(3);
    parts.push(
      `colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rm=${rm}:gm=${gm}:bm=${bm}:rh=${rh}:gh=${gh}:bh=${bh}`,
    );
  }
  if (Math.abs(w.offset.r) + Math.abs(w.offset.g) + Math.abs(w.offset.b) > 1e-4) {
    parts.push(
      `eq=brightness=${((w.offset.r + w.offset.g + w.offset.b) / 3).toFixed(3)}`,
    );
  }
  if (Math.abs(w.temperature) > 1e-4 || Math.abs(w.tint) > 1e-4) {
    const temp = w.temperature / 100;
    const tint = w.tint / 100;
    parts.push(
      `colorbalance=rs=${(temp * 0.18 + tint * 0.05).toFixed(3)}:gs=${(-tint * 0.12).toFixed(3)}:bs=${(-temp * 0.18 + tint * 0.05).toFixed(3)}`,
    );
  }
  return parts;
}

function ffmpegCurve(points: CurvePoint[]): string {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const xs = sorted.map((p) => p.x.toFixed(4)).join(' ');
  const ys = sorted.map((p) => p.y.toFixed(4)).join(' ');
  return `${xs}|${ys}`;
}

/** ffmpeg curves filter. */
export function curvesToFFmpeg(c: Curves): string[] {
  if (hasIdentityCurves(c)) return [];
  const master = isIdentityCurve(c.master) ? 'identity' : ffmpegCurve(c.master);
  const red = isIdentityCurve(c.red) ? 'identity' : ffmpegCurve(c.red);
  const green = isIdentityCurve(c.green) ? 'identity' : ffmpegCurve(c.green);
  const blue = isIdentityCurve(c.blue) ? 'identity' : ffmpegCurve(c.blue);
  return [`curves=master='${master}':red='${red}':green='${green}':blue='${blue}'`];
}

/** Compute an RGB histogram for the scopes panel from a canvas. */
export function computeHistogram(canvas: HTMLCanvasElement): {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
} {
  const ctx = canvas.getContext('2d');
  const bins = 64;
  const r = new Array(bins).fill(0);
  const g = new Array(bins).fill(0);
  const b = new Array(bins).fill(0);
  const luma = new Array(bins).fill(0);
  if (!ctx) return { r, g, b, luma };
  const { width, height } = canvas;
  const stepX = Math.max(1, Math.floor(width / 240));
  const stepY = Math.max(1, Math.floor(height / 135));
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      r[Math.min(bins - 1, (data[i] / 256) * bins | 0)]++;
      g[Math.min(bins - 1, (data[i + 1] / 256) * bins | 0)]++;
      b[Math.min(bins - 1, (data[i + 2] / 256) * bins | 0)]++;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      luma[Math.min(bins - 1, (l / 256) * bins | 0)]++;
    }
  }
  return { r, g, b, luma };
}
