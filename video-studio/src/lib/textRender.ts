import type { TextStyle } from '../types';

/**
 * Draws a text layer at a given progress through its clip.
 * Shared by the live preview and the exporter so what you see is what renders.
 */
export function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  text: TextStyle,
  width: number,
  height: number,
  progress: number,
  alpha: number,
) {
  const scaleFactor = height / 1080;
  const fontSize = text.fontSize * scaleFactor;

  let a = alpha;
  let dy = 0;
  let dx = 0;
  let scale = 1;
  let visible = text.text;

  const animWindow = Math.min(1, 0.4 / Math.max(0.001, 1));
  const p = Math.min(1, progress / Math.max(0.0001, animWindow));

  switch (text.animation) {
    case 'fade':
      a *= p;
      break;
    case 'slide-up':
      a *= p;
      dy = (1 - p) * 60 * scaleFactor;
      break;
    case 'slide-down':
      a *= p;
      dy = -(1 - p) * 60 * scaleFactor;
      break;
    case 'slide-left':
      a *= p;
      dx = (1 - p) * 120 * scaleFactor;
      break;
    case 'slide-right':
      a *= p;
      dx = -(1 - p) * 120 * scaleFactor;
      break;
    case 'pop':
      scale = 0.6 + 0.4 * (1 - Math.pow(1 - p, 3));
      a *= p;
      break;
    case 'typewriter':
      visible = text.text.slice(0, Math.ceil(text.text.length * Math.min(1, progress / 0.5)));
      break;
    case 'none':
    default:
      break;
  }

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, a));
  ctx.translate(width * text.x + dx, height * text.y + dy);
  ctx.scale(scale, scale);
  ctx.textAlign = text.align;
  ctx.textBaseline = 'middle';
  ctx.font = `${text.italic ? 'italic ' : ''}${text.bold ? '700 ' : '400 '}${fontSize}px ${text.fontFamily}`;

  const lines = visible.split('\n');
  const lineHeight = fontSize * 1.22;
  const totalHeight = lines.length * lineHeight;

  if (text.background !== 'transparent') {
    const maxWidth = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    const pad = fontSize * 0.35;
    const bx = text.align === 'center' ? -maxWidth / 2 : text.align === 'right' ? -maxWidth : 0;
    ctx.fillStyle = text.background;
    ctx.fillRect(bx - pad, -totalHeight / 2 - pad * 0.5, maxWidth + pad * 2, totalHeight + pad);
  }

  ctx.fillStyle = text.color;
  lines.forEach((line, i) => {
    const y = -totalHeight / 2 + lineHeight * (i + 0.5);
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}
