import type { GeneratorType } from '../types';

/** Draw a synthetic source (colour bars, ramps, solids) into the frame. */
export function drawGenerator(
  ctx: CanvasRenderingContext2D,
  type: GeneratorType,
  width: number,
  height: number,
) {
  ctx.save();
  switch (type) {
    case 'grey-scale': {
      const g = ctx.createLinearGradient(0, 0, width, 0);
      for (let i = 0; i <= 10; i++) {
        const v = Math.round((i / 10) * 255);
        g.addColorStop(i / 10, `rgb(${v},${v},${v})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'ebu-bars': {
      const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
      const w = width / colors.length;
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * w, 0, w + 1, height);
      });
      break;
    }
    case 'smpte-bars': {
      const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      const w = width / top.length;
      top.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * w, 0, w + 1, height * 0.67);
      });
      const mid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
      mid.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * w, height * 0.67, w + 1, height * 0.08);
      });
      const bottom = ['#0d0d0d', '#ffffff', '#1a1a1a', '#000000'];
      bottom.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect((i * width) / bottom.length, height * 0.75, width / bottom.length + 1, height * 0.25);
      });
      break;
    }
    case 'ten-step': {
      for (let i = 0; i < 10; i++) {
        const v = Math.round((i / 9) * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect((i * width) / 10, 0, width / 10 + 1, height);
      }
      break;
    }
    case 'white':
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'window':
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(width * 0.25, height * 0.25, width * 0.5, height * 0.5);
      break;
    case 'ycbcr-ramp': {
      const g = ctx.createLinearGradient(0, 0, width, 0);
      g.addColorStop(0, '#00ff00');
      g.addColorStop(0.5, '#808080');
      g.addColorStop(1, '#ff00ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'solid-color':
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, 0, width, height);
      break;
    default:
      break;
  }
  ctx.restore();
}
