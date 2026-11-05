import type { EffectInstance, EffectType } from '../types';

/** CSS filter fragments contributed by the effect stack. */
export function effectFilterParts(effects: EffectInstance[]): string[] {
  const parts: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const amount = fx.params.amount ?? 0.5;
    switch (fx.type) {
      case 'blur':
        parts.push(`blur(${Math.max(0, amount).toFixed(1)}px)`);
        break;
      case 'sharpen':
        parts.push(`contrast(${(1 + amount * 0.35).toFixed(3)})`, `saturate(${(1 + amount * 0.2).toFixed(3)})`);
        break;
      case 'beauty':
      case 'face-refinement':
        parts.push(
          `blur(${(amount * 1.6).toFixed(1)}px)`,
          `brightness(${(1 + amount * 0.06).toFixed(3)})`,
          `saturate(${(1 + amount * 0.08).toFixed(3)})`,
        );
        break;
      default:
        break;
    }
  }
  return parts;
}

let noiseCanvas: HTMLCanvasElement | null = null;
function getNoise(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

/** Paint overlay-only effects (no source needed) into the current context. */
export function drawEffectOverlays(
  ctx: CanvasRenderingContext2D,
  effects: EffectInstance[],
  width: number,
  height: number,
) {
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const amount = Math.min(1, Math.max(0, fx.params.amount ?? 0.5));
    ctx.save();
    switch (fx.type) {
      case 'vignette': {
        const g = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * (0.25 + (1 - amount) * 0.2),
          width / 2,
          height / 2,
          Math.max(width, height) * 0.72,
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${(0.15 + amount * 0.7).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'grain': {
        const pattern = ctx.createPattern(getNoise(), 'repeat');
        if (pattern) {
          ctx.globalAlpha = amount * 0.35;
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, width, height);
        }
        break;
      }
      case 'grid': {
        const size = Math.max(8, fx.params.size ?? 48);
        ctx.globalAlpha = 0.35 + amount * 0.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += size) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += size) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        break;
      }
      case 'color-generator': {
        const hue = fx.params.hue ?? 200;
        ctx.fillStyle = `hsl(${hue}, 62%, 50%)`;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'color-palette': {
        const hues = [0, 45, 90, 135, 180, 225, 270, 315];
        const sw = width / hues.length;
        hues.forEach((h, i) => {
          ctx.fillStyle = `hsl(${(h + (fx.params.hue ?? 0)) % 360}, 65%, 50%)`;
          ctx.fillRect(i * sw, 0, sw, height);
        });
        ctx.globalAlpha = amount;
        break;
      }
      case 'light-rays': {
        const g = ctx.createRadialGradient(width * 0.7, height * 0.05, 0, width * 0.7, height * 0.05, height);
        g.addColorStop(0, `rgba(255,245,210,${(0.55 * amount).toFixed(3)})`);
        g.addColorStop(0.4, `rgba(255,220,150,${(0.18 * amount).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        break;
      }
      case 'lens-flare': {
        ctx.globalCompositeOperation = 'screen';
        const cx = width * 0.32;
        const cy = height * 0.3;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.5);
        g.addColorStop(0, `rgba(255,240,200,${(0.7 * amount).toFixed(3)})`);
        g.addColorStop(0.15, `rgba(255,200,120,${(0.28 * amount).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        for (let i = 1; i <= 4; i++) {
          ctx.globalAlpha = amount * 0.18;
          ctx.fillStyle = i % 2 ? '#8fd3ff' : '#ffcf8f';
          ctx.beginPath();
          ctx.arc(cx + i * width * 0.12, cy + i * height * 0.05, height * 0.03 * i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'lens-reflections': {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = amount * 0.35;
        for (let i = 1; i <= 3; i++) {
          const g = ctx.createRadialGradient(
            width * (0.5 + i * 0.12),
            height * (0.5 - i * 0.1),
            0,
            width * (0.5 + i * 0.12),
            height * (0.5 - i * 0.1),
            height * 0.18,
          );
          g.addColorStop(0, 'rgba(160,210,255,0.7)');
          g.addColorStop(1, 'rgba(160,210,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(width * (0.5 + i * 0.12), height * (0.5 - i * 0.1), height * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'aperture-diffraction': {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = amount * 0.35;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        const cx = width / 2;
        const cy = height / 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * width, cy + Math.sin(a) * height);
          ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
}

/** ffmpeg filters for the effect stack (only filters available in ffmpeg.wasm). */
export function effectsToFFmpeg(effects: EffectInstance[]): string[] {
  const parts: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const amount = fx.params.amount ?? 0.5;
    switch (fx.type) {
      case 'blur':
        parts.push(`gblur=sigma=${Math.max(0.1, amount / 2).toFixed(2)}`);
        break;
      case 'sharpen':
        parts.push(`unsharp=5:5:${(amount * 1.2).toFixed(2)}`);
        break;
      case 'beauty':
      case 'face-refinement':
        parts.push(`gblur=sigma=${Math.max(0.1, amount).toFixed(2)}`);
        break;
      case 'vignette':
        parts.push(`vignette=angle=${(Math.PI / (4 + amount * 4)).toFixed(3)}`);
        break;
      case 'grain':
        parts.push(`noise=alls=${Math.round(amount * 30)}:allf=t+u`);
        break;
      default:
        break;
    }
  }
  return parts;
}

export const EFFECT_CATEGORY_ORDER: Record<EffectType, string> = {
  'color-generator': 'ResolveFX Generate',
  'color-palette': 'ResolveFX Generate',
  grid: 'ResolveFX Generate',
  'aperture-diffraction': 'ResolveFX Light',
  glow: 'ResolveFX Light',
  'lens-flare': 'ResolveFX Light',
  'lens-reflections': 'ResolveFX Light',
  'light-rays': 'ResolveFX Light',
  'alpha-shrink-grow': 'ResolveFX Refine',
  beauty: 'ResolveFX Refine',
  'face-refinement': 'ResolveFX Refine',
  blur: 'Blur',
  sharpen: 'Sharpen',
  glitch: 'Stylize',
  vignette: 'Stylize',
  grain: 'Stylize',
};
