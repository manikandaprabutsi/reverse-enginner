import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { Clip, ExportOptions, MediaAsset, PowerWindow, Project } from '../types';
import { drawTextLayer } from './textRender';
import { isGradeIdentity, wheelsToFFmpeg, curvesToFFmpeg } from './color';
import { effectsToFFmpeg } from './effects';
import { drawGenerator } from './generators';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export type LogHandler = (message: string) => void;

export async function getFFmpeg(onLog?: LogHandler): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    const ff = new FFmpeg();
    if (onLog) {
      ff.on('log', ({ message }) => onLog(message));
    }
    try {
      // The Vite dev server rewrites plain module requests, so hand ffmpeg
      // blob URLs instead. That also keeps the 31 MB wasm out of the bundle.
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
        toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
      ]);
      await ff.load({ coreURL, wasmURL });
    } catch (err) {
      onLog?.(`ffmpeg load failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    instance = ff;
    return ff;
  })();

  return loading;
}

/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function projectDuration(clips: Clip[]): number {
  return clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

function atempoChain(speed: number): string[] {
  let s = clamp(speed, 0.25, 4);
  const stages: string[] = [];
  while (s > 2) {
    stages.push('atempo=2');
    s /= 2;
  }
  while (s < 0.5) {
    stages.push('atempo=0.5');
    s /= 0.5;
  }
  stages.push(`atempo=${s.toFixed(4)}`);
  return stages;
}

function colourFilters(clip: Clip): string[] {
  const c = clip.color;
  const parts: string[] = [];
  if (c.brightness !== 1 || c.contrast !== 1 || c.saturation !== 1) {
    parts.push(
      `eq=brightness=${(c.brightness - 1).toFixed(3)}:contrast=${c.contrast.toFixed(3)}:saturation=${c.saturation.toFixed(3)}`,
    );
  }
  if (c.hue !== 0) parts.push(`hue=h=${c.hue.toFixed(1)}`);
  if (c.grayscale > 0) parts.push(`hue=s=${(1 - c.grayscale).toFixed(3)}`);
  if (c.sepia > 0) {
    parts.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0`);
  }
  if (c.blur > 0) parts.push(`gblur=sigma=${Math.max(0.1, c.blur / 2).toFixed(2)}`);
  return parts;
}

function chromaFilter(clip: Clip): string[] {
  if (!clip.chroma.enabled) return [];
  const hex = clip.chroma.color.replace('#', '');
  const key = `0x${hex}`;
  const similarity = clamp(clip.chroma.similarity, 0.01, 1).toFixed(3);
  const blend = clamp(clip.chroma.blend, 0.001, 1).toFixed(3);
  return [`colorkey=${key}:${similarity}:${blend}`];
}

/** Re-emit a parsed LUT as .cube text for ffmpeg's lut3d filter. */
function lutToCubeText(lut: { name: string; size: number; data: number[] }): string {
  const lines = [`TITLE "${lut.name}"`, `LUT_3D_SIZE ${lut.size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let i = 0; i < lut.data.length; i += 3) {
    lines.push(
      `${lut.data[i].toFixed(6)} ${lut.data[i + 1].toFixed(6)} ${lut.data[i + 2].toFixed(6)}`,
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * PowerWindows: each enabled local correction is applied to the clip
 * stream before it is overlaid on the timeline. The window is cropped
 * from a split of the clip and re-overlaid with the window grade, so
 * the result matches the preview.
 * ------------------------------------------------------------------ */

function windowGrade(win: PowerWindow): string[] {
  const s = win.settings;
  const parts: string[] = [];
  if (s.brightness !== 1 || s.contrast !== 1 || s.saturation !== 1) {
    parts.push(
      `eq=brightness=${(s.brightness - 1).toFixed(3)}:contrast=${s.contrast.toFixed(3)}:saturation=${s.saturation.toFixed(3)}`,
    );
  }
  if (s.hue !== 0) parts.push(`hue=h=${s.hue.toFixed(1)}`);
  if (s.grayscale > 0) parts.push(`hue=s=${(1 - s.grayscale).toFixed(3)}`);
  if (s.sepia > 0) {
    parts.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0`);
  }
  if (s.blur > 0) parts.push(`gblur=sigma=${Math.max(0.1, s.blur / 2).toFixed(2)}`);
  return parts;
}

function powerWindowChain(
  input: string,
  win: PowerWindow,
  clip: Clip,
  width: number,
  height: number,
  out: string,
): string[] {
  const winW = Math.max(2, Math.round(clamp(win.w ?? 0.4, 0.01, 1) * width));
  const winH = Math.max(2, Math.round(clamp(win.h ?? 0.4, 0.01, 1) * height));
  const x = Math.round(clamp((win.x ?? 0.5) * width - winW / 2, 0, width - winW));
  const y = Math.round(clamp((win.y ?? 0.5) * height - winH / 2, 0, height - winH));
  const opacity = clamp(win.opacity ?? 1, 0, 1).toFixed(3);
  const enable = `between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`;
  const grade = windowGrade(win);
  const lines: string[] = [];

  if (win.invert) {
    // Grade the whole frame, then paint the ungraded window back on top.
    const graded = `${out}g`;
    const keep = `${out}k`;
    lines.push(`[${input}]split[${keep}][${out}src]`);
    lines.push(`[${out}src]${grade.length ? `${grade.join(',')},` : ''}format=rgba[${graded}]`);
    lines.push(`[${keep}]crop=${winW}:${winH}:${x}:${y},format=rgba,colorchannelmixer=aa=${opacity}[${keep}c]`);
    lines.push(`[${graded}][${keep}c]overlay=x=${x}:y=${y}:eof_action=pass:enable='${enable}'[${out}]`);
  } else {
    const base = `${out}b`;
    lines.push(`[${input}]split[${base}][${out}src]`);
    lines.push(
      `[${out}src]${[...grade, `crop=${winW}:${winH}:${x}:${y}`, 'format=rgba', `colorchannelmixer=aa=${opacity}`].join(',')}[${out}w]`,
    );
    lines.push(`[${base}][${out}w]overlay=x=${x}:y=${y}:eof_action=pass:enable='${enable}'[${out}]`);
  }

  return lines;
}

function overlayXY(clip: Clip, width: number, height: number): { x: string; y: string } {
  const t = clip.transitionIn;
  const start = clip.start;
  const end = start + t.duration;

  if (t.type === 'slide-left' || t.type === 'slide-right') {
    const from = t.type === 'slide-left' ? width : -width;
    return {
      x: `'if(lt(t,${start}),${from},if(lt(t,${end}),${from}*(1-(t-${start})/${Math.max(0.01, t.duration)}),0))'`,
      y: '0',
    };
  }
  return { x: '0', y: '0' };
}

/* ------------------------------------------------------------------ *
 * Text overlays are rasterised in the browser and composited by ffmpeg.
 * That keeps the exported text pixel-identical to the preview, including
 * fonts, colours, backgrounds and the pop/typewriter animations.
 * ------------------------------------------------------------------ */

interface TextOverlay {
  clip: Clip;
  frames: { name: string; pattern?: string; rate: number; count: number };
  still: boolean;
}

function make2D(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return { canvas, ctx };
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('PNG encode failed'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

async function rasteriseText(
  ff: FFmpeg,
  clip: Clip,
  width: number,
  height: number,
  onProgress?: (p: number) => void,
): Promise<TextOverlay> {
  const text = clip.text!;
  const animated = text.animation === 'pop' || text.animation === 'typewriter';
  const { canvas, ctx } = make2D(width, height);

  if (!animated) {
    // One still frame is enough; fade/slide are applied as ffmpeg expressions.
    ctx.clearRect(0, 0, width, height);
    drawTextLayer(ctx, text, width, height, 1, 1);
    const name = `txt_${clip.id}.png`;
    await ff.writeFile(name, await toPngBlob(canvas));
    return { clip, frames: { name, rate: 1, count: 1 }, still: true };
  }

  const rate = 10;
  const count = Math.max(2, Math.ceil(clip.duration * rate));
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    ctx.clearRect(0, 0, width, height);
    drawTextLayer(ctx, text, width, height, progress, 1);
    await ff.writeFile(`txt_${clip.id}_%04d.png`.replace('%04d', String(i).padStart(4, '0')), await toPngBlob(canvas));
    if (onProgress) onProgress(i / count);
  }

  return {
    clip,
    frames: { name: `txt_${clip.id}_%04d.png`, rate, count },
    still: false,
  };
}

/* ------------------------------------------------------------------ */

export interface ExportProgress {
  stage: 'preparing' | 'encoding' | 'finalising';
  ratio: number;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  url: string;
  filename: string;
}

export async function exportProject(
  project: Project,
  options: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  onLog?: LogHandler,
): Promise<ExportResult> {
  const duration = projectDuration(project.clips);
  if (duration <= 0) throw new Error('Timeline is empty — add a clip first.');

  const ff = await getFFmpeg(onLog);
  const W = options.width;
  const H = options.height;
  const fps = options.fps;

  onProgress({ stage: 'preparing', ratio: 0.02, message: 'Loading media into ffmpeg' });

  const assetIndex = new Map<string, number>();
  const assets = new Map(project.assets.map((a) => [a.id, a]));

  const used = project.clips.filter((c) => c.assetId && assets.has(c.assetId));
  for (const clip of used) {
    if (!assetIndex.has(clip.assetId!)) assetIndex.set(clip.assetId!, assetIndex.size);
  }

  const inputArgs: string[] = [];
  let inputCursor = 0;
  const inputLabel = new Map<string, number>();

  for (const [assetId] of assetIndex) {
    const asset = assets.get(assetId)!;
    const name = `in_${assetId}.${asset.file.name.split('.').pop() ?? 'mp4'}`;
    await ff.writeFile(name, new Uint8Array(await asset.file.arrayBuffer()));
    if (asset.kind === 'image') {
      inputArgs.push('-loop', '1', '-t', String(Math.ceil(duration) + 1), '-i', name);
    } else {
      inputArgs.push('-i', name);
    }
    inputLabel.set(assetId, inputCursor++);
  }

  const filters: string[] = [];
  filters.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)}[base]`);
  let current = 'base';
  let counter = 0;

  const videoTracks = project.tracks.filter((t) => t.kind === 'video');
  const orderedVideoClips: Clip[] = [];
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const track = videoTracks[i];
    const clips = project.clips
      .filter(
        (c) =>
          c.trackId === track.id &&
          !track.muted &&
          (c.assetId || (c.generator && c.generator !== 'none')),
      )
      .sort((a, b) => a.start - b.start);
    orderedVideoClips.push(...clips);
  }

  onProgress({ stage: 'preparing', ratio: 0.08, message: 'Building filter graph' });

  // Generators are rasterised once and looped for the clip duration.
  const generatorFiles: string[] = [];
  const lutFiles: string[] = [];
  for (const clip of orderedVideoClips) {
    if (clip.assetId || !clip.generator || clip.generator === 'none') continue;
    const { canvas, ctx } = make2D(W, H);
    drawGenerator(ctx, clip.generator, W, H);
    const name = `gen_${clip.id}.png`;
    await ff.writeFile(name, await toPngBlob(canvas));
    generatorFiles.push(name);
    inputArgs.push('-loop', '1', '-t', String(Math.ceil(clip.duration) + 1), '-i', name);
    inputLabel.set(`gen:${clip.id}`, inputCursor++);
  }

  for (const clip of orderedVideoClips) {
    const isGenerator = !clip.assetId && !!clip.generator && clip.generator !== 'none';
    const asset = clip.assetId ? assets.get(clip.assetId) : null;
    if (!isGenerator && !asset) continue;
    const idx = inputLabel.get(isGenerator ? `gen:${clip.id}` : clip.assetId!)!;
    const label = `v${counter++}`;

    const chain: string[] = [];
    if (isGenerator) {
      chain.push(`[${idx}:v]trim=start=0:end=${clip.duration.toFixed(3)}`, 'setpts=PTS-STARTPTS');
    } else {
      const trimEnd = clip.inPoint + clip.duration * clip.speed;
      chain.push(`[${idx}:v]trim=start=${clip.inPoint.toFixed(3)}:end=${trimEnd.toFixed(3)}`, 'setpts=PTS-STARTPTS');
    }
    if (clip.transform.flipX) chain.push('hflip');
    if (clip.transform.flipY) chain.push('vflip');
    const ct = clip.transform;
    if (
      (ct.cropTop ?? 0) + (ct.cropBottom ?? 0) + (ct.cropLeft ?? 0) + (ct.cropRight ?? 0) >
      0.001
    ) {
      chain.push(
        `crop=iw*(1-${(ct.cropLeft ?? 0).toFixed(3)}-${(ct.cropRight ?? 0).toFixed(3)}):ih*(1-${(ct.cropTop ?? 0).toFixed(3)}-${(ct.cropBottom ?? 0).toFixed(3)}):iw*${(ct.cropLeft ?? 0).toFixed(3)}:ih*${(ct.cropTop ?? 0).toFixed(3)}`,
      );
    }
    chain.push(
      `fps=${fps}`,
      `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
      'format=rgba',
    );

    if (!isGenerator && clip.speed !== 1) chain.push(`setpts=PTS/${clip.speed.toFixed(4)}`);
    chain.push(...colourFilters(clip));
    if (!isGradeIdentity(clip.wheels, clip.curves)) {
      chain.push(...wheelsToFFmpeg(clip.wheels), ...curvesToFFmpeg(clip.curves));
    }
    if (clip.lut) {
      const lutName = `lut_${clip.id}.cube`;
      await ff.writeFile(lutName, new TextEncoder().encode(lutToCubeText(clip.lut)));
      lutFiles.push(lutName);
      chain.push(`lut3d=file=${lutName}`);
    }
    if (clip.effectsList.length > 0) chain.push(...effectsToFFmpeg(clip.effectsList));
    chain.push(...chromaFilter(clip));

    const fade = clip.transitionIn;
    const dissolveTypes = [
      'fade',
      'dip',
      'cross-dissolve',
      'additive-dissolve',
      'dip-to-color',
      'center-wipe',
      'clock-wipe',
      'edge-wipe',
      'venetian-blind',
      'cross-iris',
      'diamond-iris',
      'oval-iris',
      '5-star',
      'box',
      'heart',
      'triangle-left',
      'triangle-right',
      'wipe',
    ];
    if (dissolveTypes.includes(fade.type)) {
      chain.push(
        `fade=t=in:st=${clip.start.toFixed(3)}:d=${Math.min(fade.duration, clip.duration).toFixed(3)}:alpha=1`,
      );
    }
    if (clip.effects.fadeOut > 0) {
      const st = clip.start + clip.duration - clip.effects.fadeOut;
      chain.push(`fade=t=out:st=${st.toFixed(3)}:d=${clip.effects.fadeOut.toFixed(3)}:alpha=1`);
    }

    chain.push(`setpts=PTS+${clip.start.toFixed(3)}/TB[${label}]`);
    filters.push(chain.join(','));

    // Local correction windows are composited onto the clip in frame space
    // before the clip is laid onto the timeline.
    let videoLabel = label;
    for (const win of (clip.windows ?? []).filter((w) => w.enabled)) {
      const pw = `pw${counter++}`;
      filters.push(...powerWindowChain(videoLabel, win, clip, W, H, pw));
      videoLabel = pw;
    }

    const { x, y } = overlayXY(clip, W, H);
    const next = `o${counter}`;
    filters.push(
      `[${current}][${videoLabel}]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=0:enable='between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})'[${next}]`,
    );
    current = next;
  }

  // Text and caption overlays
  const textClips = project.clips.filter((c) => c.text && c.trackId && project.tracks.find((t) => t.id === c.trackId && !t.muted));
  for (const clip of textClips) {
    const overlay = await rasteriseText(ff, clip, W, H, (p) =>
      onProgress({ stage: 'preparing', ratio: 0.1 + p * 0.1, message: 'Rendering text layers' }),
    );

    const idx = inputCursor++;
    if (overlay.still) {
      inputArgs.push('-loop', '1', '-t', String(Math.ceil(clip.duration) + 1), '-i', overlay.frames.name);
    } else {
      inputArgs.push('-framerate', String(overlay.frames.rate), '-i', overlay.frames.name);
    }

    const label = `t${counter++}`;
    const chain = [`[${idx}:v]format=rgba`, `setpts=PTS-STARTPTS+${clip.start.toFixed(3)}/TB`];
    const fadeDur = Math.min(0.4, clip.duration / 2);
    if (overlay.still) {
      chain.push(`fade=t=in:st=${clip.start.toFixed(3)}:d=${fadeDur.toFixed(3)}:alpha=1`);
    }
    chain.push(`fade=t=out:st=${(clip.start + clip.duration - fadeDur).toFixed(3)}:d=${fadeDur.toFixed(3)}:alpha=1`);
    filters.push(`${chain.join(',')}[${label}]`);

    const next = `o${counter}`;
    filters.push(
      `[${current}][${label}]overlay=x=0:y=0:eof_action=pass:repeatlast=0:enable='between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})'[${next}]`,
    );
    current = next;
  }

  // Audio
  const audioTracks = project.tracks.filter((t) => t.kind === 'audio');
  const anySolo = audioTracks.some((t) => t.solo);
  const audioClips = project.clips.filter((c) => {
    if (!c.assetId) return false;
    const asset = assets.get(c.assetId);
    if (!asset || !asset.hasAudio || asset.kind === 'image') return false;
    const track = project.tracks.find((t) => t.id === c.trackId);
    if (c.muted || track?.muted) return false;
    if (anySolo && track?.kind === 'audio' && !track.solo) return false;
    return c.volume > 0;
  });

  const audioLabels: string[] = [];
  for (const clip of audioClips) {
    const idx = inputLabel.get(clip.assetId!)!;
    const label = `a${counter++}`;
    const parts = [
      `[${idx}:a]atrim=start=${clip.inPoint.toFixed(3)}:end=${(clip.inPoint + clip.duration * clip.speed).toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
      ...atempoChain(clip.speed),
    ];
    const af = clip.audio;
    if (af) {
      if (Math.abs(af.eqLow) > 0.01) parts.push(`bass=g=${af.eqLow.toFixed(2)}:f=120`);
      if (Math.abs(af.eqMid) > 0.01) parts.push(`equalizer=f=1000:width_type=o:width=1.5:g=${af.eqMid.toFixed(2)}`);
      if (Math.abs(af.eqHigh) > 0.01) parts.push(`treble=g=${af.eqHigh.toFixed(2)}:f=6000`);
      if (af.noiseReduction > 0.01) parts.push(`afftdn=nf=${(-20 - af.noiseReduction * 25).toFixed(1)}`);
      if (af.voiceEnhance > 0.01) {
        parts.push('highpass=f=90', 'lowpass=f=9000');
        parts.push(`equalizer=f=2600:width_type=o:width=1.2:g=${(af.voiceEnhance * 5).toFixed(2)}`);
        parts.push(`acompressor=threshold=${(0.25 - af.voiceEnhance * 0.15).toFixed(3)}:ratio=${(2 + af.voiceEnhance * 2).toFixed(2)}`);
      }
      if (Math.abs(af.pitch) > 0.01) {
        const ratio = Math.pow(2, af.pitch / 12);
        parts.push(`asetrate=48000*${ratio.toFixed(4)}`, 'aresample=48000', `atempo=${(1 / ratio).toFixed(4)}`);
      }
    }
    parts.push(
      `volume=${(clip.volume * (project.tracks.find((t) => t.id === clip.trackId)?.volume ?? 1)).toFixed(3)}`,
      `adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}`,
    );
    if (clip.effects.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${clip.effects.fadeIn.toFixed(3)}`);
    if (clip.effects.fadeOut > 0) {
      parts.push(`afade=t=out:st=${(clip.duration - clip.effects.fadeOut).toFixed(3)}:d=${clip.effects.fadeOut.toFixed(3)}`);
    }
    filters.push(`${parts.join(',')}[${label}]`);
    audioLabels.push(`[${label}]`);
  }

  let audioOut = '';
  if (audioLabels.length === 1) {
    filters.push(`${audioLabels[0]}alimiter=limit=0.95[aout]`);
    audioOut = '-map [aout]';
  } else if (audioLabels.length > 1) {
    filters.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]`,
    );
    audioOut = '-map [aout]';
  }

  filters.push(`[${current}]format=yuv420p[vout]`);

  const outputName = `export.${options.format}`;
  const filterGraph = filters.join(';');

  onProgress({ stage: 'encoding', ratio: 0.22, message: 'Encoding video' });

  let lastRatio = 0;
  const progressHandler = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    const ratio = clamp(progress, 0, 1);
    lastRatio = ratio;
    onProgress({
      stage: 'encoding',
      ratio: 0.22 + ratio * 0.7,
      message: `Encoding ${(ratio * 100).toFixed(0)}%`,
    });
  };
  ff.on('progress', progressHandler);

  const codec: string[] =
    options.format === 'webm'
      ? ['-c:v', 'libvpx-vp9', '-b:v', options.videoBitrate, '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis']
      : [
          '-c:v',
          options.codec === 'h265' ? 'libx265' : 'libx264',
          '-preset',
          options.preset,
          '-b:v',
          options.videoBitrate,
          '-c:a',
          'aac',
          '-b:a',
          '192k',
        ];

  try {
    await ff.exec([
      ...inputArgs,
      '-filter_complex',
      filterGraph,
      '-map',
      '[vout]',
      ...(audioOut ? audioOut.split(' ') : []),
      ...(audioOut ? [] : ['-an']),
      ...codec,
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(fps),
      '-t',
      duration.toFixed(3),
      '-movflags',
      '+faststart',
      outputName,
    ]);
  } finally {
    ff.off('progress', progressHandler);
  }

  onProgress({ stage: 'finalising', ratio: 0.95, message: 'Reading output' });
  const data = (await ff.readFile(outputName)) as Uint8Array;
  const mime = options.format === 'webm' ? 'video/webm' : options.format === 'mov' ? 'video/quicktime' : 'video/mp4';
  const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);

  // Housekeeping: free the wasm FS so a second export does not run out of memory.
  try {
    await ff.deleteFile(outputName);
    for (const [assetId] of assetIndex) {
      await ff.deleteFile(`in_${assetId}.${assets.get(assetId)!.file.name.split('.').pop() ?? 'mp4'}`);
    }
    for (const clip of textClips) {
      await ff.deleteFile(`txt_${clip.id}.png`);
    }
    for (const name of generatorFiles) {
      await ff.deleteFile(name);
    }
    for (const name of lutFiles) {
      await ff.deleteFile(name);
    }
  } catch {
    /* best effort */
  }

  onProgress({ stage: 'finalising', ratio: 1, message: `Done (${(lastRatio * 100).toFixed(0)}%)` });

  const safeName = project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'export';
  return { blob, url, filename: `${safeName}-${W}x${H}.${options.format}` };
}

export function downloadResult(result: ExportResult) {
  const a = document.createElement('a');
  a.href = result.url;
  a.download = result.filename;
  a.click();
}

export function estimateExportSizeMb(duration: number, bitrate: string): number {
  const kbps = parseFloat(bitrate.replace(/[^0-9.]/g, '')) || 8000;
  return (duration * kbps) / 8 / 1024;
}

export type { MediaAsset };
