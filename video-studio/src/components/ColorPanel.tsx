import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useEditor } from '../store/editorStore';
import {
  DEFAULT_CURVES,
  DEFAULT_WHEELS,
  type ColorWheels,
  type CurvePoint,
  type Curves,
  type RGB,
} from '../types';
import { computeHistogram } from '../lib/color';
import { getPreviewCanvas } from '../lib/previewCanvas';

type WheelKey = 'lift' | 'gamma' | 'gain' | 'offset';
type CurveKey = 'master' | 'red' | 'green' | 'blue';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const wheelColour: Record<WheelKey, string> = {
  lift: '#5eead4',
  gamma: '#fbbf24',
  gain: '#f87171',
  offset: '#a78bfa',
};

function rgbToPad({ r, g, b }: RGB): { x: number; y: number; luma: number } {
  const luma = (r + g + b) / 3;
  const rr = r - luma;
  const gg = g - luma;
  const bb = b - luma;
  return {
    x: Math.max(-1, Math.min(1, ((2 * rr - gg - bb) / 3) * 2)),
    y: Math.max(-1, Math.min(1, (-(gg - bb) / Math.sqrt(3)) * 2)),
    luma: Math.max(-1, Math.min(1, luma * 2)),
  };
}

function padToRgb(x: number, y: number, luma: number): RGB {
  const angle = Math.atan2(-y, x);
  const sat = Math.min(1, Math.hypot(x, y));
  const c = sat * 0.5;
  return {
    r: +(luma * 0.5 + c * Math.cos(angle)).toFixed(3),
    g: +(luma * 0.5 + c * Math.cos(angle - (Math.PI * 2) / 3)).toFixed(3),
    b: +(luma * 0.5 + c * Math.cos(angle + (Math.PI * 2) / 3)).toFixed(3),
  };
}

function WheelPad({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value: RGB;
  accent: string;
  onChange: (rgb: RGB) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const { x, y, luma } = rgbToPad(value);

  const updateFromEvent = (e: React.PointerEvent) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const len = Math.hypot(nx, ny);
    const k = len > 1 ? 1 / len : 1;
    onChange(padToRgb(nx * k, ny * k, luma));
  };

  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateFromEvent(e);
    const move = (ev: PointerEvent) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
      const len = Math.hypot(nx, ny);
      const k = len > 1 ? 1 / len : 1;
      onChange(padToRgb(nx * k, ny * k, luma));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
      <div
        ref={padRef}
        onPointerDown={begin}
        className="relative h-[86px] w-[86px] cursor-crosshair touch-none rounded-full border shadow-inner"
        style={{
          borderColor: `${accent}55`,
          background:
            'radial-gradient(circle, #3a3a3a 0%, #222 55%, #0b0b0b 100%), conic-gradient(#f87171,#fbbf24,#4ade80,#22d3ee,#60a5fa,#c084fc,#f87171)',
          backgroundBlendMode: 'normal',
          boxShadow: 'inset 0 0 22px rgba(0,0,0,0.65)',
        }}
      >
        <div
          className="pointer-events-none absolute h-1.5 w-1.5 rounded-full border border-white shadow"
          style={{
            left: `calc(${((x + 1) / 2) * 100}% - 3px)`,
            top: `calc(${((y + 1) / 2) * 100}% - 3px)`,
            background: accent,
          }}
        />
      </div>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={luma}
        onChange={(e) => {
          const v = Number(e.target.value);
          const cur = padToRgb(x, y, luma);
          const delta = (v - luma) * 0.5;
          onChange({
            r: +(cur.r + delta).toFixed(3),
            g: +(cur.g + delta).toFixed(3),
            b: +(cur.b + delta).toFixed(3),
          });
        }}
        className="w-[80px]"
        title={`${label} luminance`}
      />
    </div>
  );
}

function CurveEditor({
  points,
  colour,
  onChange,
}: {
  points: CurvePoint[];
  colour: string;
  onChange: (points: CurvePoint[]) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const sorted = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points]);

  const toLocal = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01(1 - (clientY - rect.top) / rect.height),
    };
  };

  const path = (() => {
    if (!sorted.length) return '';
    let d = `M ${sorted[0].x * 100} ${100 - sorted[0].y * 100}`;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const cx = (a.x + b.x) / 2;
      d += ` C ${cx * 100} ${100 - a.y * 100}, ${cx * 100} ${100 - b.y * 100}, ${b.x * 100} ${100 - b.y * 100}`;
    }
    return d;
  })();

  const startDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    setActive(index);
    const move = (ev: PointerEvent) => {
      const local = toLocal(ev.clientX, ev.clientY);
      const next = sorted.map((p, i) => (i === index ? local : p));
      onChange(next);
    };
    const up = () => {
      setActive(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-[180px] w-full touch-none rounded border border-ink-600 bg-[#111]"
      onDoubleClick={(e) => {
        const local = toLocal(e.clientX, e.clientY);
        onChange([...sorted, local].sort((a, b) => a.x - b.x));
      }}
    >
      {[25, 50, 75].map((v) => (
        <g key={v} stroke="rgba(255,255,255,0.06)" strokeWidth={0.4}>
          <line x1={v} y1={0} x2={v} y2={100} />
          <line x1={0} y1={v} x2={100} y2={v} />
        </g>
      ))}
      <line x1={0} y1={100} x2={100} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.4} strokeDasharray="2 2" />
      <path d={path} fill="none" stroke={colour} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={p.x * 100}
          cy={100 - p.y * 100}
          r={active === i ? 2.6 : 1.8}
          fill={active === i ? '#fff' : colour}
          stroke="#000"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
          className="cursor-grab"
          onPointerDown={(e) => startDrag(e, i)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (sorted.length > 2) onChange(sorted.filter((_, idx) => idx !== i));
          }}
        />
      ))}
    </svg>
  );
}

function Scopes() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const target = ref.current;
      const source = getPreviewCanvas();
      if (target && source) {
        const ctx = target.getContext('2d');
        if (ctx) {
          const w = target.width;
          const h = target.height;
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(0, 0, w, h);
          if (source.width > 0 && source.height > 0) {
            const hist = computeHistogram(source);
            const plot = (values: number[], colour: string, x0: number, width: number) => {
              const max = Math.max(1, ...values);
              ctx.beginPath();
              ctx.moveTo(x0, h);
              values.forEach((v, i) => {
                const x = x0 + (i / (values.length - 1)) * width;
                const y = h - (v / max) * (h - 6);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.strokeStyle = colour;
              ctx.lineWidth = 1.2;
              ctx.stroke();
              ctx.lineTo(x0 + width, h);
              ctx.closePath();
              ctx.fillStyle = `${colour}22`;
              ctx.fill();
            };
            const third = (w - 8) / 3;
            plot(hist.r, '#f87171', 2, third);
            plot(hist.g, '#4ade80', 6 + third, third);
            plot(hist.b, '#60a5fa', 10 + third * 2, third);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.moveTo(4, h - 1);
            ctx.lineTo(w - 4, h - 1);
            ctx.stroke();
          }
        }
      }
      raf = window.setTimeout(draw, 220) as unknown as number;
    };
    draw();
    return () => window.clearTimeout(raf);
  }, []);

  return (
    <div className="space-y-1">
      <p className="label mb-0">RGB Parade · Scopes</p>
      <canvas ref={ref} width={300} height={110} className="h-[110px] w-full rounded border border-ink-600" />
      <div className="flex justify-between font-mono text-[8px] text-zinc-600">
        <span>0</span>
        <span>shadows</span>
        <span>mids</span>
        <span>highlights</span>
        <span>255</span>
      </div>
    </div>
  );
}

export function ColorPanel({ className }: { className?: string }) {
  const clips = useEditor((s) => s.clips);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const updateClip = useEditor((s) => s.updateClip);
  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const [curveKey, setCurveKey] = useState<CurveKey>('master');

  if (!clip || clip.text) {
    return (
      <div className={clsx('flex h-full items-center justify-center bg-ink-850 p-4 text-center', className)}>
        <p className="text-xs text-zinc-500">Select a video clip to open the color page.</p>
      </div>
    );
  }

  const wheels = clip.wheels ?? DEFAULT_WHEELS;
  const curves = clip.curves ?? DEFAULT_CURVES;

  const patchWheels = (patch: Partial<ColorWheels>) =>
    updateClip(clip.id, { wheels: { ...wheels, ...patch } });
  const patchCurve = (key: CurveKey, points: CurvePoint[]) =>
    updateClip(clip.id, { curves: { ...curves, [key]: points } });

  const presets: { label: string; patch: Partial<ColorWheels>; color?: Partial<typeof clip.color> }[] = [
    { label: 'Reset', patch: structuredClone(DEFAULT_WHEELS) },
    {
      label: 'Warm',
      patch: { ...wheels, temperature: 32, tint: 6, low: 0.02, high: 0.98, softClip: true },
    },
    {
      label: 'Cool',
      patch: { ...wheels, temperature: -32, tint: -8, low: 0.02, high: 0.98, softClip: true },
    },
    {
      label: 'Teal / Orange',
      patch: {
        ...wheels,
        lift: { r: -0.06, g: 0.03, b: 0.1 },
        gain: { r: 0.16, g: 0.02, b: -0.16 },
        pivot: 0.45,
      },
    },
    {
      label: 'B&W',
      patch: { ...wheels },
      color: { saturation: 0 },
    },
    {
      label: 'High contrast',
      patch: { ...wheels, low: 0.04, high: 0.92, lowSoft: 0.15, highSoft: 0.15, softClip: true },
      color: { contrast: 1.25 },
    },
  ];

  return (
    <div className={clsx('flex h-full min-h-0 flex-col bg-ink-850', className)}>
      <div className="panel-header">
        <span>Color</span>
        <span className="chip">{clip.generator ? 'Generator' : 'Primary grade'}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className="rounded border border-ink-600 px-1.5 py-0.5 text-[9px] text-zinc-400 transition hover:border-accent/50 hover:text-zinc-100"
              onClick={() =>
                updateClip(clip.id, {
                  wheels: { ...DEFAULT_WHEELS, ...preset.patch, lift: { ...(preset.patch.lift ?? wheels.lift) } },
                  ...(preset.color ? { color: { ...clip.color, ...preset.color } } : {}),
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">Color wheels</p>
            <button
              className="text-zinc-500 transition hover:text-zinc-200"
              title="Reset wheels"
              onClick={() => updateClip(clip.id, { wheels: structuredClone(DEFAULT_WHEELS) })}
            >
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['lift', 'gamma', 'gain', 'offset'] as WheelKey[]).map((key) => (
              <WheelPad
                key={key}
                label={key}
                accent={wheelColour[key]}
                value={wheels[key]}
                onChange={(rgb) => patchWheels({ [key]: rgb })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-ink-700 pt-3">
          <p className="label mb-0">White balance</p>
          <Slider
            label="Temperature"
            min={-100}
            max={100}
            step={1}
            value={wheels.temperature}
            onChange={(v) => patchWheels({ temperature: v })}
          />
          <Slider
            label="Tint"
            min={-100}
            max={100}
            step={1}
            value={wheels.tint}
            onChange={(v) => patchWheels({ tint: v })}
          />
          <Slider
            label="Pivot"
            min={0}
            max={1}
            step={0.01}
            value={wheels.pivot}
            onChange={(v) => patchWheels({ pivot: v })}
          />
          <Slider
            label="Luma mix"
            min={0}
            max={1}
            step={0.01}
            value={wheels.lumaMix}
            onChange={(v) => patchWheels({ lumaMix: v })}
          />
        </div>

        <div className="space-y-2 border-t border-ink-700 pt-3">
          <div className="flex items-center justify-between">
            <p className="label mb-0">Custom color</p>
            <label className="flex items-center gap-1 text-[10px] text-zinc-500">
              <input
                type="checkbox"
                checked={wheels.softClip}
                onChange={(e) => patchWheels({ softClip: e.target.checked })}
                className="accent-[var(--color-accent)]"
              />
              Soft clip
            </label>
          </div>
          <Slider
            label="Low"
            min={0}
            max={0.5}
            step={0.005}
            value={wheels.low}
            onChange={(v) => patchWheels({ low: v })}
          />
          <Slider
            label="Low soft"
            min={0}
            max={1}
            step={0.01}
            value={wheels.lowSoft}
            onChange={(v) => patchWheels({ lowSoft: v })}
          />
          <Slider
            label="High"
            min={0.5}
            max={1}
            step={0.005}
            value={wheels.high}
            onChange={(v) => patchWheels({ high: v })}
          />
          <Slider
            label="High soft"
            min={0}
            max={1}
            step={0.01}
            value={wheels.highSoft}
            onChange={(v) => patchWheels({ highSoft: v })}
          />
          <div className="grid grid-cols-3 gap-1 pt-1 font-mono text-[9px] text-zinc-500">
            <span>R {wheels.gain.r.toFixed(2)}</span>
            <span>G {wheels.gain.g.toFixed(2)}</span>
            <span>B {wheels.gain.b.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2 border-t border-ink-700 pt-3">
          <div className="flex items-center justify-between">
            <p className="label mb-0">Curves</p>
            <button
              className="text-zinc-500 transition hover:text-zinc-200"
              title="Reset curve"
              onClick={() => patchCurve(curveKey, [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ])}
            >
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(['master', 'red', 'green', 'blue'] as CurveKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setCurveKey(key)}
                className={clsx(
                  'rounded border px-1 py-1 text-[9px] font-medium capitalize transition',
                  curveKey === key
                    ? 'border-transparent text-black'
                    : 'border-ink-600 text-zinc-400 hover:text-zinc-200',
                )}
                style={
                  curveKey === key
                    ? {
                        background:
                          key === 'red'
                            ? '#f87171'
                            : key === 'green'
                              ? '#4ade80'
                              : key === 'blue'
                                ? '#60a5fa'
                                : '#e4e4e7',
                      }
                    : undefined
                }
              >
                {key}
              </button>
            ))}
          </div>
          <CurveEditor
            points={curves[curveKey]}
            colour={
              curveKey === 'red'
                ? '#f87171'
                : curveKey === 'green'
                  ? '#4ade80'
                  : curveKey === 'blue'
                    ? '#60a5fa'
                    : '#e4e4e7'
            }
            onChange={(points) => patchCurve(curveKey, points)}
          />
          <p className="text-[9px] text-zinc-600">Double-click to add a point, double-click a point to remove.</p>
        </div>

        <div className="border-t border-ink-700 pt-3">
          <Scopes />
        </div>

        <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-800 p-2 text-[10px] text-zinc-500">
          <SlidersHorizontal size={12} />
          <span>
            {clip.lut ? `LUT: ${clip.lut.name}` : 'No 3D LUT loaded — import one in the LUTs panel.'}
          </span>
        </div>
        <button
          className="btn w-full"
          onClick={() =>
            updateClip(clip.id, {
              wheels: structuredClone(DEFAULT_WHEELS),
              curves: structuredClone(DEFAULT_CURVES),
              color: { ...clip.color, brightness: 1, contrast: 1, saturation: 1, hue: 0 },
            })
          }
        >
          <Sparkles size={12} /> Reset grade
        </button>
      </div>
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="font-mono text-[9px] text-zinc-400">{Number(value).toFixed(2)}</span>
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
