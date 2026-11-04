import { useMemo, useState } from 'react';
import {
  Download,
  Film,
  Loader2,
  Mic,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';
import {
  DEFAULT_POWER_WINDOW,
  RESOLUTIONS,
  type ExportOptions,
  type PowerWindow,
  type TextAnimation,
} from '../types';
import { exportProject, estimateExportSizeMb, getFFmpeg } from '../lib/export';
import {
  transcribe,
  captioningSupported,
  type CaptionProgress,
  type CaptionSegment,
} from '../lib/captions';
import { formatDuration } from '../lib/time';

const fonts = [
  'Inter, system-ui, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Impact, Haettenschweiler, sans-serif',
  'Georgia, serif',
  'Courier New, monospace',
];

const animations: { value: TextAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade in' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-down', label: 'Slide down' },
  { value: 'slide-left', label: 'Slide left' },
  { value: 'slide-right', label: 'Slide right' },
  { value: 'typewriter', label: 'Typewriter' },
];

type Tab = 'clip' | 'text' | 'color' | 'power' | 'captions' | 'export';

export function Inspector() {
  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const tracks = useEditor((s) => s.tracks);
  const settings = useEditor((s) => s.settings);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const updateClip = useEditor((s) => s.updateClip);
  const addTextClip = useEditor((s) => s.addTextClip);
  const addCaptionClips = useEditor((s) => s.addCaptionClips);
  const setSettings = useEditor((s) => s.setSettings);
  const name = useEditor((s) => s.name);

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const asset = clip?.assetId ? assets.find((a) => a.id === clip.assetId) : undefined;

  const patchWindow = (index: number, patch: Partial<PowerWindow>) => {
    if (!clip) return;
    const windows = [...(clip.windows ?? [])];
    if (!windows[index]) return;
    windows[index] = { ...windows[index], ...patch };
    updateClip(clip.id, { windows });
  };

  const patchWindowSetting = (
    index: number,
    key: keyof PowerWindow['settings'],
    value: number,
  ) => {
    if (!clip) return;
    const windows = [...(clip.windows ?? [])];
    const win = windows[index];
    if (!win) return;
    windows[index] = { ...win, settings: { ...win.settings, [key]: value } };
    updateClip(clip.id, { windows });
  };

  const addPowerWindow = () => {
    if (!clip) return;
    const nextWindow: PowerWindow = {
      ...DEFAULT_POWER_WINDOW,
      id: `pw-${Date.now().toString(36)}`,
      name: `Window ${(clip.windows?.length ?? 0) + 1}`,
      settings: { ...DEFAULT_POWER_WINDOW.settings },
    };
    updateClip(clip.id, { windows: [...(clip.windows ?? []), nextWindow] });
  };

  const [tab, setTab] = useState<Tab>('clip');

  const [exporting, setExporting] = useState(false);
  const [exportLog, setExportLog] = useState<string[]>([]);
  const [exportProg, setExportProg] = useState<{ stage: string; ratio: number; message: string } | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const [captionFile, setCaptionFile] = useState<File | null>(null);
  const [captionProg, setCaptionProg] = useState<CaptionProgress | null>(null);
  const [captionSegs, setCaptionSegs] = useState<CaptionSegment[] | null>(null);
  const [captionErr, setCaptionErr] = useState<string | null>(null);

  const canTranscribe = captioningSupported();

  const [opt, setOpt] = useState<ExportOptions>({
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '8000k',
    preset: 'fast',
    format: 'mp4',
  });

  const duration = useMemo(
    () => clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0),
    [clips],
  );

  const startExport = async () => {
    setExporting(true);
    setExportErr(null);
    setExportLog([]);
    try {
      await getFFmpeg((message) => setExportLog((l) => [...l.slice(-30), message]));
      const result = await exportProject(
        { name, assets, tracks, clips, settings },
        opt,
        (p) => setExportProg({ stage: p.stage, ratio: p.ratio, message: p.message }),
      );
      const a = document.createElement('a');
      a.href = result.url;
      a.download = result.filename;
      a.click();
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
      setExportProg(null);
    }
  };

  const startCaptions = async () => {
    if (!captionFile) return;
    setCaptionErr(null);
    setCaptionSegs(null);
    setCaptionProg({ stage: 'decoding', progress: 0.02 });
    try {
      const segs = await transcribe(captionFile, (p) => setCaptionProg(p));
      setCaptionSegs(segs);
    } catch (err) {
      setCaptionErr(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptionProg(null);
    }
  };

  const tabs: { id: Tab; icon: typeof Video; label: string }[] = [
    { id: 'clip', icon: Video, label: 'Clip' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'color', icon: Palette, label: 'Color' },
    { id: 'power', icon: Wand2, label: 'Power Windows' },
    { id: 'captions', icon: Mic, label: 'Captions' },
    { id: 'export', icon: Download, label: 'Export' },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-ink-850">
      <div className="panel-header">
        <span>Inspector</span>
        {clip && (
          <span className="chip max-w-[140px] truncate">
            {clip.text ? 'Text' : asset?.name ?? 'Clip'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1 border-b border-ink-700 px-2 py-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={clsx(
              'flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[9px] font-medium transition',
              tab === item.id ? 'bg-ink-700 text-zinc-100' : 'text-zinc-500 hover:bg-ink-750 hover:text-zinc-300',
            )}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---------------- CLIP ---------------- */}
        {tab === 'clip' &&
          (!clip ? (
            <EmptyState icon={<Film size={18} />} text="Select a clip in the timeline" />
          ) : (
            <div className="space-y-4 p-3">
              <div>
                <p className="label">Speed</p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.125}
                    max={4}
                    step={0.125}
                    value={clip.speed}
                    onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-[11px] text-zinc-300">
                    {clip.speed.toFixed(2)}×
                  </span>
                </div>
              </div>

              <div>
                <p className="label">Volume</p>
                <div className="flex items-center gap-2">
                  <Volume2 size={13} className="text-zinc-500" />
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={clip.volume}
                    onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-[11px] text-zinc-300">
                    {Math.round(clip.volume * 100)}%
                  </span>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clip.muted}
                    onChange={(e) => updateClip(clip.id, { muted: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                  Mute this clip
                </label>
              </div>

              <div className="space-y-2 border-t border-ink-700 pt-3">
                <p className="label">Layout</p>
                <select
                  className="field"
                  value={clip.transform.fit}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      transform: { ...clip.transform, fit: e.target.value as 'contain' | 'cover' | 'stretch' },
                    })
                  }
                >
                  <option value="contain">Fit (letterbox)</option>
                  <option value="cover">Fill (crop)</option>
                  <option value="stretch">Stretch</option>
                </select>

                <Slider
                  label="Scale"
                  min={0.2}
                  max={3}
                  step={0.01}
                  value={clip.transform.scale}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, scale: v } })}
                />
                <Slider
                  label="Opacity"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.transform.opacity}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, opacity: v } })}
                />
                <Slider
                  label="Rotation"
                  min={-180}
                  max={180}
                  step={1}
                  value={clip.transform.rotation}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, rotation: v } })}
                  suffix="°"
                />
                <Slider
                  label="Position X"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={clip.transform.x}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, x: v } })}
                />
                <Slider
                  label="Position Y"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={clip.transform.y}
                  onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, y: v } })}
                />
              </div>

              <div className="space-y-2 border-t border-ink-700 pt-3">
                <p className="label">Effects</p>
                <Slider
                  label="Fade in"
                  min={0}
                  max={3}
                  step={0.05}
                  value={clip.effects.fadeIn}
                  onChange={(v) => updateClip(clip.id, { effects: { ...clip.effects, fadeIn: v } })}
                  suffix="s"
                />
                <Slider
                  label="Fade out"
                  min={0}
                  max={3}
                  step={0.05}
                  value={clip.effects.fadeOut}
                  onChange={(v) => updateClip(clip.id, { effects: { ...clip.effects, fadeOut: v } })}
                  suffix="s"
                />
                <Slider
                  label="Ken Burns zoom"
                  min={1}
                  max={1.6}
                  step={0.01}
                  value={clip.effects.zoom}
                  onChange={(v) => updateClip(clip.id, { effects: { ...clip.effects, zoom: v } })}
                  suffix="×"
                />
              </div>

              <div className="space-y-2 border-t border-ink-700 pt-3">
                <p className="label">Transition in</p>
                <div className="flex gap-1.5">
                  <select
                    className="field flex-1"
                    value={clip.transitionIn.type}
                    onChange={(e) =>
                      updateClip(clip.id, {
                        transitionIn: { ...clip.transitionIn, type: e.target.value as typeof clip.transitionIn.type },
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="fade">Cross fade</option>
                    <option value="dip">Dip to black</option>
                    <option value="slide-left">Slide from right</option>
                    <option value="slide-right">Slide from left</option>
                    <option value="wipe">Wipe</option>
                  </select>
                  <input
                    type="number"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={clip.transitionIn.duration}
                    onChange={(e) =>
                      updateClip(clip.id, {
                        transitionIn: { ...clip.transitionIn, duration: Number(e.target.value) || 0.5 },
                      })
                    }
                    className="field w-16 text-center"
                  />
                </div>
                {clip.transitionIn.type === 'wipe' && (
                  <p className="text-[10px] text-amber-500/80">
                    Wipe renders in the preview; export approximates it as a fade.
                  </p>
                )}
              </div>
            </div>
          ))}

        {/* ---------------- TEXT ---------------- */}
        {tab === 'text' && (
          <div className="space-y-3 p-3">
            {!clip?.text ? (
              <div className="space-y-3">
                <EmptyState icon={<Type size={18} />} text="No text clip selected" />
                <button className="btn btn-accent w-full" onClick={() => addTextClip()}>
                  <Type size={13} /> Add text at playhead
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="label">Content</p>
                  <textarea
                    className="field h-20 resize-none"
                    value={clip.text.text}
                    onChange={(e) =>
                      updateClip(clip.id, { text: { ...clip.text!, text: e.target.value } })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="label">Font</p>
                    <select
                      className="field"
                      value={clip.text.fontFamily}
                      onChange={(e) =>
                        updateClip(clip.id, { text: { ...clip.text!, fontFamily: e.target.value } })
                      }
                    >
                      {fonts.map((f) => (
                        <option key={f} value={f}>
                          {f.split(',')[0]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="label">Size</p>
                    <input
                      type="number"
                      className="field"
                      value={clip.text.fontSize}
                      min={12}
                      max={400}
                      onChange={(e) =>
                        updateClip(clip.id, { text: { ...clip.text!, fontSize: Number(e.target.value) || 64 } })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="label">Colour</p>
                    <input
                      type="color"
                      className="h-8 w-full rounded border border-ink-600 bg-ink-800"
                      value={clip.text.color}
                      onChange={(e) =>
                        updateClip(clip.id, { text: { ...clip.text!, color: e.target.value } })
                      }
                    />
                  </div>
                  <div>
                    <p className="label">Alignment</p>
                    <select
                      className="field"
                      value={clip.text.align}
                      onChange={(e) =>
                        updateClip(clip.id, {
                          text: { ...clip.text!, align: e.target.value as 'left' | 'center' | 'right' },
                        })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <div>
                  <p className="label">Animation</p>
                  <select
                    className="field"
                    value={clip.text.animation}
                    onChange={(e) =>
                      updateClip(clip.id, {
                        text: { ...clip.text!, animation: e.target.value as TextAnimation },
                      })
                    }
                  >
                    {animations.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Slider
                  label="Position X"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.text.x}
                  onChange={(v) => updateClip(clip.id, { text: { ...clip.text!, x: v } })}
                />
                <Slider
                  label="Position Y"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.text.y}
                  onChange={(v) => updateClip(clip.id, { text: { ...clip.text!, y: v } })}
                />

                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clip.text.background !== 'transparent'}
                    onChange={(e) =>
                      updateClip(clip.id, {
                        text: { ...clip.text!, background: e.target.checked ? 'rgba(0,0,0,0.55)' : 'transparent' },
                      })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  Caption background plate
                </label>

                <button className="btn w-full" onClick={() => addTextClip()}>
                  <Type size={13} /> Add another text clip
                </button>
              </>
            )}
          </div>
        )}

        {/* ---------------- COLOR ---------------- */}
        {tab === 'color' &&
          (!clip || clip.text ? (
            <EmptyState icon={<Palette size={18} />} text="Select a video clip to grade" />
          ) : (
            <div className="space-y-4 p-3">
              <Slider
                label="Brightness"
                min={0}
                max={2}
                step={0.01}
                value={clip.color.brightness}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, brightness: v } })}
              />
              <Slider
                label="Contrast"
                min={0}
                max={2}
                step={0.01}
                value={clip.color.contrast}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, contrast: v } })}
              />
              <Slider
                label="Saturation"
                min={0}
                max={2}
                step={0.01}
                value={clip.color.saturation}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, saturation: v } })}
              />
              <Slider
                label="Hue"
                min={-180}
                max={180}
                step={1}
                value={clip.color.hue}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, hue: v } })}
                suffix="°"
              />
              <Slider
                label="Blur"
                min={0}
                max={20}
                step={0.5}
                value={clip.color.blur}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, blur: v } })}
                suffix="px"
              />
              <Slider
                label="Sepia"
                min={0}
                max={1}
                step={0.01}
                value={clip.color.sepia}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, sepia: v } })}
              />
              <Slider
                label="Monochrome"
                min={0}
                max={1}
                step={0.01}
                value={clip.color.grayscale}
                onChange={(v) => updateClip(clip.id, { color: { ...clip.color, grayscale: v } })}
              />

              <div className="space-y-2 border-t border-ink-700 pt-3">
                <div className="flex items-center justify-between">
                  <p className="label mb-0">Chroma key</p>
                  <input
                    type="checkbox"
                    checked={clip.chroma.enabled}
                    onChange={(e) =>
                      updateClip(clip.id, { chroma: { ...clip.chroma, enabled: e.target.checked } })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                </div>
                <input
                  type="color"
                  className="h-8 w-full rounded border border-ink-600 bg-ink-800"
                  value={clip.chroma.color}
                  onChange={(e) => updateClip(clip.id, { chroma: { ...clip.chroma, color: e.target.value } })}
                />
                <Slider
                  label="Similarity"
                  min={0.02}
                  max={1}
                  step={0.01}
                  value={clip.chroma.similarity}
                  onChange={(v) => updateClip(clip.id, { chroma: { ...clip.chroma, similarity: v } })}
                />
                <Slider
                  label="Edge blend"
                  min={0.001}
                  max={0.6}
                  step={0.001}
                  value={clip.chroma.blend}
                  onChange={(v) => updateClip(clip.id, { chroma: { ...clip.chroma, blend: v } })}
                />
                <Slider
                  label="Spill removal"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.chroma.spill}
                  onChange={(v) => updateClip(clip.id, { chroma: { ...clip.chroma, spill: v } })}
                />
              </div>
            </div>
          ))}

        {/* ---------------- POWER WINDOWS ---------------- */}
        {tab === 'power' &&
          (!clip || clip.text ? (
            <EmptyState icon={<Wand2 size={18} />} text="Select a video clip to add correction windows" />
          ) : (
            <div className="space-y-3 p-3">
              <button
                onClick={addPowerWindow}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-ink-750"
              >
                <Plus size={13} /> Add power window
              </button>

              {(clip.windows ?? []).length === 0 && (
                <p className="py-6 text-center text-[11px] text-zinc-500">
                  No windows yet. Add one to grade a region of the frame.
                </p>
              )}

              {(clip.windows ?? []).map((win, index) => (
                <div key={win.id} className="space-y-2 rounded-md border border-ink-700 bg-ink-800 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-300">{win.name}</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <input
                          type="checkbox"
                          checked={win.enabled}
                          onChange={(e) => patchWindow(index, { enabled: e.target.checked })}
                          className="accent-[var(--color-accent)]"
                        />
                        On
                      </label>
                      <button
                        onClick={() =>
                          updateClip(clip.id, {
                            windows: (clip.windows ?? []).filter((w) => w.id !== win.id),
                          })
                        }
                        className="text-zinc-500 transition hover:text-red-400"
                        title="Remove window"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <Slider
                    label="Position X"
                    min={0}
                    max={1}
                    step={0.01}
                    value={win.x}
                    onChange={(v) => patchWindow(index, { x: v })}
                  />
                  <Slider
                    label="Position Y"
                    min={0}
                    max={1}
                    step={0.01}
                    value={win.y}
                    onChange={(v) => patchWindow(index, { y: v })}
                  />
                  <Slider
                    label="Width"
                    min={0.02}
                    max={1}
                    step={0.01}
                    value={win.w}
                    onChange={(v) => patchWindow(index, { w: v })}
                  />
                  <Slider
                    label="Height"
                    min={0.02}
                    max={1}
                    step={0.01}
                    value={win.h}
                    onChange={(v) => patchWindow(index, { h: v })}
                  />
                  <Slider
                    label="Opacity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={win.opacity}
                    onChange={(v) => patchWindow(index, { opacity: v })}
                  />

                  <div className="grid grid-cols-2 gap-2 border-t border-ink-700 pt-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <input
                        type="checkbox"
                        checked={win.invert}
                        onChange={(e) => patchWindow(index, { invert: e.target.checked })}
                        className="accent-[var(--color-accent)]"
                      />
                      Invert
                    </label>
                    <select
                      className="rounded border border-ink-600 bg-ink-800 px-1.5 py-1 text-[10px] text-zinc-300"
                      value={win.blend}
                      onChange={(e) =>
                        patchWindow(index, { blend: e.target.value as PowerWindow['blend'] })
                      }
                    >
                      <option value="normal">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="darken">Darken</option>
                      <option value="lighten">Lighten</option>
                    </select>
                  </div>

                  <div className="space-y-2 border-t border-ink-700 pt-2">
                    <Slider
                      label="Brightness"
                      min={0}
                      max={2}
                      step={0.01}
                      value={win.settings.brightness}
                      onChange={(v) => patchWindowSetting(index, 'brightness', v)}
                    />
                    <Slider
                      label="Contrast"
                      min={0}
                      max={2}
                      step={0.01}
                      value={win.settings.contrast}
                      onChange={(v) => patchWindowSetting(index, 'contrast', v)}
                    />
                    <Slider
                      label="Saturation"
                      min={0}
                      max={2}
                      step={0.01}
                      value={win.settings.saturation}
                      onChange={(v) => patchWindowSetting(index, 'saturation', v)}
                    />
                    <Slider
                      label="Hue"
                      min={-180}
                      max={180}
                      step={1}
                      value={win.settings.hue}
                      onChange={(v) => patchWindowSetting(index, 'hue', v)}
                      suffix="°"
                    />
                    <Slider
                      label="Blur"
                      min={0}
                      max={20}
                      step={0.5}
                      value={win.settings.blur}
                      onChange={(v) => patchWindowSetting(index, 'blur', v)}
                      suffix="px"
                    />
                    <Slider
                      label="Sepia"
                      min={0}
                      max={1}
                      step={0.01}
                      value={win.settings.sepia}
                      onChange={(v) => patchWindowSetting(index, 'sepia', v)}
                    />
                    <Slider
                      label="Monochrome"
                      min={0}
                      max={1}
                      step={0.01}
                      value={win.settings.grayscale}
                      onChange={(v) => patchWindowSetting(index, 'grayscale', v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}

        {/* ---------------- CAPTIONS ---------------- */}
        {tab === 'captions' && (
          <div className="space-y-3 p-3">
            <div className="rounded-md border border-ink-700 bg-ink-800 p-2.5 text-[11px] leading-relaxed text-zinc-400">
              Whisper runs locally in your browser via WebAssembly. The audio never leaves this machine;
              the model (~80 MB) downloads once.
            </div>

            <input
              type="file"
              accept="video/*,audio/*"
              className="field"
              onChange={(e) => setCaptionFile(e.target.files?.[0] ?? null)}
            />

            {!canTranscribe && (
              <p className="text-[11px] text-red-400">This browser cannot decode audio for transcription.</p>
            )}

            <button
              className="btn btn-accent w-full"
              disabled={!captionFile || Boolean(captionProg) || !canTranscribe}
              onClick={startCaptions}
            >
              {captionProg ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {captionProg ? 'Transcribing…' : 'Generate captions'}
            </button>

            {captionProg && (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${Math.round(captionProg.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500">
                  {captionProg.stage} {captionProg.detail ? `· ${captionProg.detail}` : ''}
                </p>
              </div>
            )}

            {captionErr && <p className="text-[11px] text-red-400">{captionErr}</p>}

            {captionSegs && (
              <div className="space-y-2">
                <p className="label mb-0">{captionSegs.length} segments found</p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-ink-700 p-1.5">
                  {captionSegs.slice(0, 60).map((seg, i) => (
                    <p key={i} className="text-[11px] text-zinc-400">
                      <span className="mr-1 font-mono text-[10px] text-accent">{formatDuration(seg.start)}</span>
                      {seg.text}
                    </p>
                  ))}
                </div>
                <button
                  className="btn w-full"
                  onClick={() => addCaptionClips(captionSegs)}
                  disabled={!captionSegs.length}
                >
                  <Sparkles size={13} /> Add to timeline as text clips
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------------- EXPORT ---------------- */}
        {tab === 'export' && (
          <div className="space-y-3 p-3">
            <div>
              <p className="label">Resolution</p>
              <select
                className="field"
                value={`${opt.width}x${opt.height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setOpt({ ...opt, width: w, height: h });
                  setSettings({ width: w, height: h });
                }}
              >
                {Object.entries(RESOLUTIONS).map(([label, size]) => (
                  <option key={label} value={`${size.width}x${size.height}`}>
                    {label} — {size.width}×{size.height}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="label">Frame rate</p>
                <select
                  className="field"
                  value={opt.fps}
                  onChange={(e) => setOpt({ ...opt, fps: Number(e.target.value) })}
                >
                  {[24, 25, 30, 50, 60].map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="label">Bitrate</p>
                <select
                  className="field"
                  value={opt.videoBitrate}
                  onChange={(e) => setOpt({ ...opt, videoBitrate: e.target.value })}
                >
                  {['3000k', '5000k', '8000k', '12000k', '20000k', '35000k'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="label">Encoder preset</p>
              <select
                className="field"
                value={opt.preset}
                onChange={(e) => setOpt({ ...opt, preset: e.target.value as ExportOptions['preset'] })}
              >
                <option value="ultrafast">Ultrafast (largest file)</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium (best quality)</option>
              </select>
            </div>

            <div className="rounded-md border border-ink-700 bg-ink-800 p-2 text-[10px] leading-relaxed text-zinc-500">
              {formatDuration(duration)} timeline · {opt.width}×{opt.height} · estimate{' '}
              {estimateExportSizeMb(duration, opt.videoBitrate).toFixed(0)} MB
              {opt.width >= 2560 && (
                <span className="mt-1 block text-amber-500/90">
                  4K in WebAssembly is slow — expect several minutes per minute of footage.
                </span>
              )}
            </div>

            <button
              className="btn btn-accent w-full py-2"
              onClick={startExport}
              disabled={exporting || duration <= 0}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? 'Rendering…' : 'Export video'}
            </button>

            {exportProg && (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full bg-accent transition-all" style={{ width: `${exportProg.ratio * 100}%` }} />
                </div>
                <p className="text-[10px] text-zinc-500">{exportProg.message}</p>
              </div>
            )}

            {exportErr && <p className="text-[11px] text-red-400">{exportErr}</p>}

            {exportLog.length > 0 && (
              <details className="rounded border border-ink-700 bg-black/40 p-1.5">
                <summary className="cursor-pointer text-[10px] text-zinc-500">ffmpeg log</summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[9px] leading-tight text-zinc-600">
                  {exportLog.join('\n')}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-2 text-zinc-600">{icon}</div>
      <p className="text-xs text-zinc-500">{text}</p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="font-mono text-[10px] text-zinc-400">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
