/**
 * Generates a short demo clip entirely in the browser.
 *
 * This exists so a first-time user (and our smoke test) can exercise the
 * real pipeline — decode → composite → effects → FFmpeg export — without
 * having any media on disk. Everything is drawn on a canvas, muxed with a
 * synthesised tone through MediaRecorder, and handed back as a WebM File.
 */

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const hue = (t * 22) % 360;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, `hsl(${hue}, 55%, 12%)`);
  bg.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 60%, 20%)`);
  bg.addColorStop(1, `hsl(${(hue + 90) % 360}, 55%, 10%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Soft light blobs
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const cx = w * (0.2 + 0.2 * i) + Math.sin(t * 0.8 + i) * 90;
    const cy = h * 0.5 + Math.cos(t * 1.1 + i * 1.7) * 120;
    const r = 160 + Math.sin(t + i) * 40;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    blob.addColorStop(0, `hsla(${(hue + i * 55) % 360}, 90%, 60%, 0.35)`);
    blob.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Film strip
  const stripY = h - 92;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, stripY, w, 92);
  const offset = (t * 180) % 64;
  for (let x = -64; x < w + 64; x += 64) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(x + offset, stripY + 22, 38, 20, 4);
    ctx.fill();
  }

  // Wipe panel
  const wipe = (Math.sin(t * 0.9) * 0.5 + 0.5) * w;
  const panel = ctx.createLinearGradient(wipe, 0, wipe + 220, 0);
  panel.addColorStop(0, 'rgba(255,122,24,0.0)');
  panel.addColorStop(0.5, 'rgba(255,122,24,0.45)');
  panel.addColorStop(1, 'rgba(255,122,24,0.0)');
  ctx.fillStyle = panel;
  ctx.fillRect(wipe - 110, 0, 220, h);

  // Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 92px Inter, system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24;
  ctx.fillText('RESOLVE LITE', w / 2, h * 0.42);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '400 30px Inter, system-ui, sans-serif';
  ctx.fillText('demo reel · generated in your browser', w / 2, h * 0.42 + 76);

  ctx.fillStyle = '#ff7a18';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText('00:0' + Math.min(9, Math.floor(t)).toString(), w / 2, h * 0.42 + 132);
  ctx.restore();

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

export async function createDemoFile(seconds = 6): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record canvas video (MediaRecorder unavailable).');
  }

  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const stream = canvas.captureStream(30);

  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const master = audioCtx.createGain();
    master.gain.value = 0.1;
    master.connect(dest);

    [220, 277.18, 329.63].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const gain = audioCtx!.createGain();
      gain.gain.value = 0.5 / (i + 1);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
    });

    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  } catch {
    audioCtx = null;
  }

  const mimeType = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((m) => MediaRecorder.isTypeSupported(m));

  if (!mimeType) throw new Error('No supported WebM recorder in this browser.');

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.start(200);
  const started = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - started) / 1000;
      drawFrame(ctx, width, height, t);
      if (t >= seconds) resolve();
      else requestAnimationFrame(frame);
    };
    frame();
  });

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.stop();
  await stopped;

  stream.getTracks().forEach((track) => track.stop());
  await audioCtx?.close().catch(() => undefined);

  return new File(chunks, 'demo-reel.webm', { type: 'video/webm' });
}
