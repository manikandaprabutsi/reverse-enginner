import type { Clip, MediaAsset, Track } from '../types';
import { DEFAULT_COLOR, type PowerWindow } from '../types';
import { drawTextLayer } from './textRender';

/* ------------------------------------------------------------------ *
 * Chroma key: a tiny WebGL pass. Doing this in JS per pixel would tank
 * the preview frame rate, so the green screen removal runs on the GPU.
 * ------------------------------------------------------------------ */

const KEY_VERT = `
attribute vec2 aPos;
varying vec2 vTex;
void main() {
  vTex = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const KEY_FRAG = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform vec3 uKey;
uniform float uSimilarity;
uniform float uBlend;
uniform float uSpill;
void main() {
  vec4 c = texture2D(uTex, vTex);
  float d = distance(c.rgb, uKey);
  float alpha = smoothstep(uSimilarity, uSimilarity + uBlend + 0.001, d);
  float spill = max(0.0, c.g - max(c.r, c.b));
  vec3 rgb = c.rgb - vec3(0.0, spill * uSpill, 0.0);
  gl_FragColor = vec4(rgb, c.a * alpha);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

class ChromaKeyer {
  private canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
    this.gl = gl;
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, KEY_VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, KEY_FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);
    this.program = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.BLEND);

    for (const name of ['uTex', 'uKey', 'uSimilarity', 'uBlend', 'uSpill']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
  }

  get available() {
    return Boolean(this.gl && this.program);
  }

  draw(source: HTMLVideoElement | HTMLImageElement, clip: Clip): HTMLCanvasElement | null {
    const gl = this.gl;
    if (!gl || !this.program) return null;

    const width = clip.chroma ? 0 : 0; // unused guard
    void width;

    const w = Math.max(2, (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || this.canvas.width);
    const h = Math.max(2, (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || this.canvas.height);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const [r, g, b] = hexToRgb(clip.chroma.color);
    gl.uniform1i(this.uniforms.uTex, 0);
    gl.uniform3f(this.uniforms.uKey, r, g, b);
    gl.uniform1f(this.uniforms.uSimilarity, clip.chroma.similarity);
    gl.uniform1f(this.uniforms.uBlend, clip.chroma.blend);
    gl.uniform1f(this.uniforms.uSpill, clip.chroma.spill);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

/* ------------------------------------------------------------------ *
 * Compositor: owns the <video> pool and paints the preview canvas.
 * ------------------------------------------------------------------ */

interface Drawable {
  el: HTMLVideoElement | HTMLImageElement;
  width: number;
  height: number;
}

export class Compositor {
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, HTMLImageElement>();
  private keyer = new ChromaKeyer();
  private lastArgs: { time: number; clips: Clip[]; tracks: Track[]; assets: Map<string, MediaAsset> } | null =
    null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
  }

  get context() {
    return this.canvas.getContext('2d')!;
  }

  private videoFor(asset: MediaAsset): HTMLVideoElement {
    let el = this.videos.get(asset.id);
    if (!el) {
      el = document.createElement('video');
      el.src = asset.url;
      el.playsInline = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      // A paused seek finishes *after* our render call, so repaint once the
      // decoder lands on the new frame. Without this the preview stays black
      // while scrubbing.
      const repaint = () => {
        const args = this.lastArgs;
        if (args) this.render(args.time, args.clips, args.tracks, args.assets);
      };
      el.addEventListener('seeked', repaint);
      el.addEventListener('loadeddata', repaint);
      el.addEventListener('canplay', repaint);
      this.videos.set(asset.id, el);
    }
    return el;
  }

  private imageFor(asset: MediaAsset): HTMLImageElement {
    let el = this.images.get(asset.id);
    if (!el) {
      el = new Image();
      el.src = asset.url;
      this.images.set(asset.id, el);
    }
    return el;
  }

  /** Keeps media elements in sync with the playhead. */
  sync(time: number, clips: Clip[], tracks: Track[], assets: Map<string, MediaAsset>, playing: boolean) {
    const active = new Set<string>();

    for (const clip of clips) {
      if (!clip.assetId) continue;
      const asset = assets.get(clip.assetId);
      if (!asset || asset.kind !== 'video') continue;
      const isActive = time >= clip.start && time < clip.start + clip.duration;
      if (!isActive) continue;

      const track = tracks.find((t) => t.id === clip.trackId);
      const el = this.videoFor(asset);
      active.add(clip.id);

      const expected = clip.inPoint + (time - clip.start) * clip.speed;
      el.playbackRate = Math.min(4, Math.max(0.0625, clip.speed));
      el.volume = Math.max(0, Math.min(1, clip.volume * (track?.volume ?? 1)));
      el.muted = clip.muted || Boolean(track?.muted) || asset.kind !== 'video';

      if (Math.abs(el.currentTime - expected) > 0.22 && Number.isFinite(expected)) {
        try {
          el.currentTime = Math.max(0, expected);
        } catch {
          /* seek can fail while metadata is still loading */
        }
      }

      if (playing && el.paused) {
        void el.play().catch(() => undefined);
      }
      if (!playing && !el.paused) {
        el.pause();
      }
    }

    for (const [assetId, el] of this.videos) {
      const stillUsed = clips.some(
        (c) => c.assetId === assetId && time >= c.start && time < c.start + c.duration,
      );
      if (!stillUsed && !el.paused) el.pause();
    }
    void active;
  }

  pauseAll() {
    for (const el of this.videos.values()) el.pause();
  }

  render(time: number, clips: Clip[], tracks: Track[], assets: Map<string, MediaAsset>) {
    this.lastArgs = { time, clips, tracks, assets };
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const ordered = [...clips].sort((a, b) => {
      const ta = tracks.findIndex((t) => t.id === a.trackId);
      const tb = tracks.findIndex((t) => t.id === b.trackId);
      if (ta !== tb) return tb - ta; // lower tracks first
      return a.start - b.start;
    });

    for (const clip of ordered) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (track?.muted) continue;
      if (time < clip.start || time >= clip.start + clip.duration) continue;
      this.drawClip(ctx, clip, time, assets);
    }
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    time: number,
    assets: Map<string, MediaAsset>,
  ) {
    const { width, height } = this.canvas;
    const local = (time - clip.start) / Math.max(0.0001, clip.duration);
    const transition = clip.transitionIn;

    let alpha = clip.transform.opacity;
    let offsetX = 0;
    let wipeWidth = 1;

    if (transition.type !== 'none' && transition.duration > 0) {
      const p = Math.min(1, (time - clip.start) / transition.duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (transition.type === 'fade' || transition.type === 'dip') alpha *= eased;
      if (transition.type === 'slide-left') offsetX = (1 - eased) * width;
      if (transition.type === 'slide-right') offsetX = -(1 - eased) * width;
      if (transition.type === 'wipe') wipeWidth = eased;
    }

    // clip-level fade in/out
    if (clip.effects.fadeIn > 0) {
      alpha *= Math.min(1, (time - clip.start) / clip.effects.fadeIn);
    }
    if (clip.effects.fadeOut > 0) {
      alpha *= Math.min(1, (clip.start + clip.duration - time) / clip.effects.fadeOut);
    }

    if (alpha <= 0.001) return;

    if (clip.text) {
      ctx.save();
      ctx.translate(offsetX, 0);
      drawTextLayer(ctx, clip.text, width, height, local, alpha);
      ctx.restore();
      return;
    }

    if (!clip.assetId) return;
    const asset = assets.get(clip.assetId);
    if (!asset) return;

    let drawable: Drawable | null = null;
    if (asset.kind === 'image') {
      const img = this.imageFor(asset);
      if (img.complete) drawable = { el: img, width: img.naturalWidth, height: img.naturalHeight };
    } else if (asset.kind === 'video') {
      const el = this.videoFor(asset);
      if (el.readyState >= 2) drawable = { el, width: el.videoWidth, height: el.videoHeight };
    }

    if (!drawable) return;

    const zoom = 1 + (clip.effects.zoom - 1) * local;
    const scale = clip.transform.scale * zoom;
    const rotation = (clip.transform.rotation * Math.PI) / 180;

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);

    const filterParts = [
      `brightness(${clip.color.brightness})`,
      `contrast(${clip.color.contrast})`,
      `saturate(${clip.color.saturation})`,
      `hue-rotate(${clip.color.hue}deg)`,
    ];
    if (clip.color.blur > 0) filterParts.push(`blur(${clip.color.blur}px)`);
    if (clip.color.sepia > 0) filterParts.push(`sepia(${clip.color.sepia})`);
    if (clip.color.grayscale > 0) filterParts.push(`grayscale(${clip.color.grayscale})`);
    ctx.filter = filterParts.join(' ');

    let source: CanvasImageSource = drawable.el;
    if (clip.chroma.enabled && this.keyer.available) {
      const keyed = this.keyer.draw(drawable.el as HTMLVideoElement, clip);
      if (keyed) source = keyed;
    }

    const srcRatio = drawable.width / drawable.height;
    const dstRatio = width / height;
    let drawW = width;
    let drawH = height;
    if (clip.transform.fit === 'contain') {
      if (srcRatio > dstRatio) drawH = width / srcRatio;
      else drawW = height * srcRatio;
    } else if (clip.transform.fit === 'cover') {
      if (srcRatio > dstRatio) drawW = height * srcRatio;
      else drawH = width / srcRatio;
    }
    drawW *= scale;
    drawH *= scale;

    let tx = width / 2 + offsetX;
    let ty = height / 2 + clip.transform.y * height;
    if (clip.transform.fit === 'cover') {
      if (drawW > width) tx -= (drawW - width) / 2;
      if (drawH > height) ty -= (drawH - height) / 2;
    }

    ctx.translate(tx, ty);
    ctx.rotate(rotation);

    if (transition.type === 'wipe') {
      ctx.beginPath();
      ctx.rect(-drawW / 2, -drawH / 2, drawW * wipeWidth, drawH);
      ctx.clip();
    }

    try {
      ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
    } catch {
      /* frame not ready */
    }

    // ----- PowerWindows: draw per‑clip local correction windows ----
    // Collect active windows for this clip at the current time
    const activeWindows = (clip.windows ?? [])
      .filter((w) => w.enabled)
      .filter((w) => time >= clip.start && time < clip.start + clip.duration);

    // Overlay each active PowerWindow on top of the base clip
    for (const win of activeWindows) {
      // Map normalised window position/size to pixel space
      const winW = (win.w ?? 0) * width;
      const winH = (win.h ?? 0) * height;
      const winX = (win.x ?? 0) * width - winW / 2;
      const winY = (win.y ?? 0) * height - winH / 2;

      // Build the window's ColorAdjust filter string
      const wf = win.settings ?? DEFAULT_COLOR;
      const wFilterParts = [
        `brightness(${wf.brightness})`,
        `contrast(${wf.contrast})`,
        `saturate(${wf.saturation})`,
        `hue-rotate(${wf.hue}deg)`,
      ];
      if (wf.blur > 0) wFilterParts.push(`blur(${wf.blur}px)`);
      if (wf.sepia > 0) wFilterParts.push(`sepia(${wf.sepia})`);
      if (wf.grayscale > 0) wFilterParts.push(`grayscale(${wf.grayscale})`);
      // Apply the window's filter + opacity in a second pass
      ctx.save();
      ctx.filter = wFilterParts.join(' ');
      ctx.globalAlpha = Math.min(1, win.opacity ?? 1);

      // Crop to the window rect and redraw the source within it
      ctx.beginPath();
      ctx.rect(winX, winY, winW, winH);
      ctx.clip();

      try {
        ctx.drawImage(source, winX, winY, winW, winH);
      } catch {
        /* frame not ready */
      }

      ctx.restore();
    }

    // End of PowerWindow overlay loop

    ctx.restore();
  }

  dispose() {
    for (const el of this.videos.values()) {
      el.pause();
      el.src = '';
    }
    this.videos.clear();
    this.images.clear();
  }
}