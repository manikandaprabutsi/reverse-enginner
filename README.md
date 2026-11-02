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
