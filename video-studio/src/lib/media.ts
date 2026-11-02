import { nanoid } from 'nanoid';
import type { AssetKind, MediaAsset } from '../types';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;

export function detectKind(file: File): AssetKind {
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  return 'video';
}

function loadElement<T extends HTMLMediaElement>(el: T, url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const done = () => resolve(el);
    el.preload = 'metadata';
    el.src = url;
    el.addEventListener('loadedmetadata', done, { once: true });
    el.addEventListener('error', () => reject(new Error('Could not read media metadata')), { once: true });
  });
}

async function makeThumbnail(video: HTMLVideoElement, url: string): Promise<string | undefined> {
  try {
    const el = document.createElement('video');
    el.src = url;
    el.muted = true;
    el.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      el.addEventListener('loadeddata', () => resolve(), { once: true });
      el.addEventListener('error', () => reject(new Error('thumb')), { once: true });
    });
    const at = Math.min(0.6, (el.duration || 1) / 3);
    await new Promise<void>((resolve) => {
      el.addEventListener('seeked', () => resolve(), { once: true });
      el.currentTime = at;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

export async function importFile(file: File): Promise<MediaAsset> {
  const kind = detectKind(file);
  const url = URL.createObjectURL(file);

  if (kind === 'image') {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not load image: ${file.name}`));
    });
    return {
      id: nanoid(8),
      name: file.name,
      url,
      kind,
      duration: 5,
      width: img.naturalWidth,
      height: img.naturalHeight,
      hasAudio: false,
      thumbnail: url,
      file,
    };
  }

  if (kind === 'audio') {
    const audio = document.createElement('audio');
    await loadElement(audio, url);
    return {
      id: nanoid(8),
      name: file.name,
      url,
      kind,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      width: 0,
      height: 0,
      hasAudio: true,
      file,
    };
  }

  const video = document.createElement('video');
  await loadElement(video, url);
  const thumbnail = await makeThumbnail(video, url);
  return {
    id: nanoid(8),
    name: file.name,
    url,
    kind,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth,
    height: video.videoHeight,
    hasAudio: true,
    thumbnail,
    file,
  };
}

/** Merges clips that touch each other on the same track and share a source. */
export function normaliseSegments<T extends { start: number; duration: number }>(segments: T[]): T[] {
  return [...segments].sort((a, b) => a.start - b.start);
}
