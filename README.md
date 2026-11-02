# Reverse Engineering Lab

A local, agent-driven reverse-engineering workspace for Windows: Ghidra for the
disassembly, an MCP bridge so an LLM can read decompiled code instead of you
copy-pasting it, and a headless path for batch triage.

Everything installs per-user under `E:\REA` (override with `$env:REA_HOME`). No
admin rights, no registry changes, nothing in `Program Files`.

## What's installed

| Component | Version | Purpose |
|---|---|---|
| [Ghidra](https://ghidra-sre.org) | 12.1.4 PUBLIC | Disassembler / decompiler |
| Temurin JDK | 21.0.13 LTS | Ghidra runtime and script compiler |
| [GhidraMCP](https://github.com/LaurieWired/GhidraMCP) | 2.0 | Ghidra plugin + MCP server |
| Python (via uv) | 3.12.13 | MCP server runtime |
| PyGhidra | 3.2.0 | Headless Ghidra from Python |

## Layout

```
scripts/
  install.ps1        one-shot, idempotent toolchain installer
  env.ps1            dot-source to set JAVA_HOME / GHIDRA_INSTALL_DIR / PATH
  start-ghidra.ps1   launch the GUI with the plugin available
  analyze.ps1        headless import + analysis + symbol dump
  ghidra/            Ghidra scripts (DumpSymbols.java)
docs/
  workflow.md        how to actually run an analysis session
labs/
  projects/          Ghidra projects (git-ignored)
  notes/             exported symbol maps and findings
opencode.json        MCP server registration for OpenCode
```

## Setup

Already done on this machine. To reproduce on another box:

```powershell
git clone https://github.com/manikandaprabutsi/reverse-enginner.git
cd reverse-enginner
.\scripts\install.ps1
```

The installer downloads ~750 MB once, then caches under `E:\REA\downloads`.

## Daily use

**Interactive (recommended)**

```powershell
.\scripts\start-ghidra.ps1
```

Import a binary, wait for auto-analysis to finish, then talk to the agent. First
run only: `File → Configure → Developer → tick GhidraMCPPlugin`.

**Headless triage**

```powershell
.\scripts\analyze.ps1 -Binary C:\path\to\target.exe -Export
```

Produces `labs/notes/<name>-symbols-<timestamp>.tsv`: address, size and name for
every function. Good for a fast "what am I looking at" pass.

**With an agent**

`opencode.json` registers the `ghidra` MCP server. Restart OpenCode after the
install, open a binary in Ghidra, and ask in plain language:

> Decompile the function at 0x140001050 and explain what it does.

> List the imports grouped by DLL and flag anything related to crypto.

> Search the strings for URLs and tell me which functions reference them.

See [docs/workflow.md](docs/workflow.md) for the full loop.

## Video studio (in-browser editor)

A second, fully client-side video editor lives in [`video-studio/`](video-studio).
It is an attempt to reproduce the *workflow* of a professional NLE (Resolve /
Premiere / Final Cut) without proprietary code: multi-track timeline, trim, split,
merge, transitions, colour grading, chroma key, text animation, auto-captions and
export — all powered by React + TypeScript + Tailwind + FFmpeg (WebAssembly).

```powershell
cd video-studio
npm install
npm run dev        # http://localhost:5173
```

### Feature checklist

- Media pool: import by picker or drag-and-drop (MP4 / WebM / MOV / MP3 / WAV / PNG / JPG).
- Timeline: multiple video / audio / text tracks, drag to move, edge handles to trim,
  split at playhead (S), merge with next (M), duplicate (Ctrl+D), delete (Del).
- Transitions: cross-fade, dip to black, slide, wipe — plus per-clip fade in/out.
- Colour grading: brightness / contrast / saturation / hue / blur / sepia / monochrome.
- Chroma key: GPU-accelerated WebGL keyer with similarity / edge blend / spill removal.
- Text overlays: 8 animations (fade, pop, slide, typewriter), fonts, colours, backgrounds.
- Auto-captions: Whisper (English, tiny) through transformers.js — fully local in WASM.
- Export: real FFmpeg compiled to WASM → libx264 + AAC (MP4) or VP9 + Vorbis (WebM),
  720p / 1080p / 1440p / 4K, variable framerate and bitrate.

### Notes and limits

- Everything runs client-side; nothing leaves the machine except the FFmpeg wasm core
  itself. Media and projects are not uploaded.
- Export renders through ffmpeg.wasm, so 4K takes minutes per minute of footage
  (fast presets on a decent CPU).
- The preview composites on a 2D canvas; chroma key is GPU (WebGL).

## Scope

Only analyse binaries you own or are licensed to inspect. `labs/` is git-ignored
for executable file types on purpose — **do not commit samples.**

## Why this repo exists

This started as an attempt to install [reagithu/REA-Github](https://github.com/reagithu/REA-Github),
a repo trending under the `reverse-engineer-anything` topic. That repo contains no
working source — its 17 "source files" are three-line placeholders — and its
`REA-6.3.0.zip` release is a renamed Microsoft WebView2 binary with the signature
stripped and an 80 MB self-extracting archive appended that silently runs a
randomly-named executable. It was not installed.

Everything here is the real, auditable equivalent: public, open-source tools from
NationalSecurityAgency, Adoptium and LaurieWired, pinned to versions that are known
to work together.
