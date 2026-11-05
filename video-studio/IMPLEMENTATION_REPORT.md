================================================================================
  RESOLVE LITE — IMPLEMENTATION REPORT
  (All features from the DaVinci Resolve parity spec)

================================================================================
1. TYPES (src/types.ts)
   - RGB, ColorWheels (lift/gamma/gain/offset/temperature/tint/pivot/lumaMix/softClip/low/high),
     CurvePoint/Curves (master/red/green/blue), GeneratorType (8 kinds),
     EffectType (16 effects), AudioFilter (eqLow/eqMid/eqHigh/noiseReduction/voiceEnhance/pitch),
     Keyframe (t + Partial<Transform>), TransitionType (21 cinematic transitions),
     TitleTemplate (basic/scroller/lower-third-L/M/R), TextStyle (+template),
     Track (solo, pan), ExportOptions (format mp4/mov), Transform (flipX/flipY/cropTop/Right/Bottom/Left),
   - Constants: DEFAULT_WHEELS, IDENTITY_CURVE, DEFAULT_CURVES, DEFAULT_AUDIO_FILTER,
     DEFAULT_TEXT, DEFAULT_POWER_WINDOW, DEFAULT_TRANSITION, RESOLUTIONS

2. STORE (src/store/editorStore.ts)
   - activePage: PageId, inspectorTab: InspectorTab, tracks.solo
   - 26 new actions: addGeneratorClip, addTitleClip, setTransition, addEffect,
     updateEffect, removeEffect, setClipLut, addKeyframe, removeKeyframe,
     rippleDelete, rollEdit, slipClip, slideClip, setActivePage, setInspectorTab
   - Project save/load/autosave + IndexedDB media persistence
   - Clip normalisation resets all grading/effects to defaults

3. COLOUR ENGINE (src/lib/color.ts)
   - sampleCurve, isIdentityCurve, isNeutralRGB, isNeutralWheels, hasIdentityCurves, isGradeIdentity
   - buildChannelLuts / applyLuts — 256-entry LUT per-pixel pass
   - wheelsToFFmpeg / curvesToFFmpeg — ffmpeg filter strings
   - computeHistogram — 64-bin RGB/luma histogram (scopes panel)

4. EFFECT ENGINE (src/lib/effects.ts)
   - effectFilterParts — CSS filter fragments
   - drawEffectOverlays — vignette/grain/grid/color-palette/light-rays/lens-flare/lens-reflections/aperture-diffraction
   - effectsToFFmpeg — ffmpeg-compatible (gblur, unsharp, noise, vignette)

5. GENERATOR ENGINE (src/lib/generators.ts)
   - drawGenerator — all 8 generator types into canvas

6. COMPOSITOR (src/lib/compositor.ts)
   - keyframeAt(clip, local) — ease-interpolated transform + opacity
   - Per-pixel LUT pass (wheels + curves + optional 3D LUT)
   - Transform: x/y/scale/rotation/fit/fit/crop/flip — all keyframe-aware
   - 21 transition types rendered in preview (fade/dip/wipe/slide/clock/iris/5-star/box/heart/triangle/venetian)
   - PowerWindows: filtered, time-gated, inverted/even-odd
   - Effect overlays drawn after clip transform
   - Crop/flip in transform chain

7. EXPORT (src/lib/export.ts)
   - Generator rasterised once as PNG, looped for duration
   - Wheels + curves baked as ffmpeg colorbalance/eq/curves
   - Imported .cube 3D LUTs via lut3d=file=...
   - Audio: EQ (bass/equalizer/treble), noise reduction (afftdn), voice enhance, pitch shift
   - Track solo logic
   - Expanded transition list (21 types)
   - Codec: H.264 (libx264) in MP4 or MOV container. The bundled ffmpeg.wasm
     build stalls in libx265 and crashes in libvpx-vp9, so those options were
     removed instead of shipped broken (verified with a direct encoder probe).
   - Deleted asset + temp file cleanup

8. MEDIA / PERSISTENCE (src/lib/media.ts + src/lib/project.ts)
   - IndexedDB persistAssets / idbGet / idbPut
   - autosaveProject / loadAutosave / clearAutosave
   - normaliseClip / normaliseTrack for JSON round-trip

9. UI COMPONENTS (new)
   - ColorPanel.tsx — wheels + temp/tint/pivot/luma mix; RGB readouts;
     curve editor (master/red/green/blue); RGB parade scopes; LUT presets
   - EffectsPanel.tsx — tabbed library (transitions/titles/generators/OpenFX); search;
     apply to clip/timeline
   - LutPanel.tsx — import .cube; built-in preset looks (warm/cool/mono/teal)
   - NodeEditor.tsx — serial/parallel FX node graph; visual stack; parallel toggle
   - AudioMixer.tsx — per-track meters; clip gain/pan; clip EQ/voice enhance/noise/pitch; presets;
     track solo/mute/volume/pan
   - PageNav.tsx — workspace nav (Gallery/Media Pool/Timeline/Clips/Nodes/OpenFX/Library/Settings);
     save/open project buttons

10. INSPECTOR (src/components/Inspector.tsx)
    - Clip tab: speed/volume/mute/layout (scale/rotation/x/y/flip/crop); effects; keyframes
    - Text tab: content/font/size/colour/alignment/animation
    - Color tab: wheels, chroma, white balance, soft clip, curve editor, scopes
    - Power Windows tab: unchanged (already complete)
    - FX tab: category scroll + apply from library; per-FX parameter sliders; parallel/bypass
    - Audio tab: clip gain, EQ low/mid/high, voice enhance, noise reduction, pitch; presets;
      track solo/mute/volume/pan
    - Export tab: resolution/fps/bitrate/preset/container (mp4/mov)

11. PREVIEW (src/components/Preview.tsx)
    - Loop playback + speed control (0.25×–4×)
    - setPreviewCanvas / getPreviewCanvas — shared ref for scopes
    - Autosync with playhead; redraw when paused

12. APP (src/App.tsx)
    - Header with project name; PageNav workspace + tool bar under it
    - Page routing: Color → ColorPanel, Fusion → NodeEditor, Fairlight → AudioMixer,
      Deliver → export inspector; Media/Edit/Cut show the viewer
    - Tool drawer (Gallery/LUTs/Lightbox/Library/OpenFX) in the right column on desktop
      and as a mobile sheet; Media Pool/Timeline/Clips/Nodes jump to their workspace
    - Save/Open project files, autosave every 900 ms, autosave restore on first load

================================================================================
VERIFIED (Playwright + Vite dev + 720p export)
  - Demo import, clip selection, Color wheels/preset, LUT preset, OpenFX Glow node
  - Fairlight mixer, solo, add track, Deliver export tab
  - Save → project JSON, Open → restore, autosave restore after reload
  - Preview renders graded pixels; 6 s 720p H.264 export completes (180 frames)
  - ffmpeg encoder probe: libx264 MP4+MOV OK; libx265 stalls, libvpx-vp9
    trips a wasm memory error, so those choices are not exposed
  - MOV export after an autosave reload contains avc1 + mp4a, with the noise
    reduction / voice enhancement audio chain applied
  - Asset metadata (hasAudio, duration, width, height) round-trips through
    save and autosave restore
  - Mobile 390×844: page nav, LUT tool sheet
================================================================================

BUILD: 1640 modules · 314 kB JS · clean tsc · successful Vite production build

================================================================================