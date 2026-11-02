/**
 * Auto-captions.
 *
 * Runs OpenAI Whisper (tiny, English) fully in the browser through
 * transformers.js — no API key, no upload, no server. The model is fetched
 * once from the Hugging Face CDN and then cached by the browser.
 *
 * Everything is open source: Whisper is MIT, transformers.js is Apache-2.0.
 */

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export type CaptionProgress = {
  stage: 'decoding' | 'loading-model' | 'transcribing' | 'done';
  progress: number; // 0..1
  detail?: string;
};

const MODEL_ID = 'Xenova/whisper-tiny.en';
const SAMPLE_RATE = 16000;

async function toMono16k(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  await ctx.close();

  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, Math.max(1, frames), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export async function transcribe(
  file: File,
  onProgress?: (p: CaptionProgress) => void,
): Promise<CaptionSegment[]> {
  onProgress?.({ stage: 'decoding', progress: 0.05, detail: 'Reading audio track' });
  const audio = await toMono16k(file);

  onProgress?.({ stage: 'loading-model', progress: 0.2, detail: `Downloading ${MODEL_ID}` });

  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;

  const transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (data: { status?: string; progress?: number; file?: string }) => {
      if (data?.status === 'progress' && typeof data.progress === 'number') {
        onProgress?.({
          stage: 'loading-model',
          progress: 0.2 + (data.progress / 100) * 0.5,
          detail: data.file ?? undefined,
        });
      }
    },
  });

  onProgress?.({ stage: 'transcribing', progress: 0.75, detail: 'Transcribing' });

  const result = (await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    // whisper-tiny.en is English-only; task/language must be omitted for it.
    ...(MODEL_ID.endsWith('.en')
      ? {}
      : { task: 'transcribe', language: 'en' }),
  })) as { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] };

  const segments: CaptionSegment[] = [];

  if (result.chunks?.length) {
    for (const chunk of result.chunks) {
      const text = chunk.text.trim();
      if (!text) continue;
      const start = chunk.timestamp[0] ?? 0;
      const end = chunk.timestamp[1] ?? start + 2;
      segments.push({ start, end, text });
    }
  } else if (result.text?.trim()) {
    // No timestamps available: split evenly across the audio.
    const duration = audio.length / SAMPLE_RATE;
    const words = result.text.trim().split(/\s+/);
    const per = duration / Math.max(1, words.length);
    words.forEach((w, i) => {
      segments.push({ start: i * per, end: (i + 1) * per, text: w });
    });
  }

  onProgress?.({ stage: 'done', progress: 1 });
  return segments;
}

export const captioningSupported = () =>
  typeof window !== 'undefined' && 'AudioContext' in window || 'webkitAudioContext' in window;
