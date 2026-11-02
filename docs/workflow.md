# Agent-driven reverse engineering

How to take an unknown binary from "I have a file" to "I have a decompiled function
map an agent can reason over".

## 1. Scope and legality

Only analyse binaries you own or are explicitly licensed to inspect. This workspace
does not ship any samples — `labs/` is empty by design and git-ignored for binary
types. Keep it that way.

## 2. Open the target

```powershell
.\scripts\start-ghidra.ps1
```

Then in Ghidra: **File → Import File**, pick your binary, accept the defaults, and say
yes to auto-analysis. Wait for the analysis bar to finish — the MCP server only sees
what has been analysed.

The GhidraMCP plugin starts an HTTP listener on `localhost:8080` as soon as a program
is open. Check it:

```powershell
curl.exe -s http://localhost:8080/methods | Select-Object -First 5
```

If that returns JSON, the agent bridge will work.

## 3. Start the agent

From this directory, OpenCode picks up `opencode.json`, which registers the `ghidra`
MCP server. Restart OpenCode once after the first install.

Then just ask, in plain language:

- "List the functions in the current program, group them by namespace."
- "Decompile the function at 0x401000 and explain what it does."
- "Find imports related to crypto and summarise the hashing routine."
- "Rename the function at 0x4021a0 to `parse_config` and add a comment explaining the struct."
- "Search all strings for URLs and tell me which functions reference them."

## 4. What the agent can and cannot do

The MCP tools operate on the *current Ghidra session*. The agent can read
decompilation, list/rename symbols, read xrefs, and inspect data — but it cannot
launch Ghidra, import files, or run a debugger. Those stay manual on purpose: they are
the steps where a human should be choosing the target.

## 5. A sane loop

1. **Triage** — file type, architecture, packing, imports.
2. **Map** — let the agent summarise function clusters and name the obvious ones.
3. **Drill** — pick one flow (a config parser, a licence check, a network call) and
   decompile it function by function.
4. **Record** — write findings as comments in Ghidra, not in your head. Renames and
   comments are the deliverable; they survive into the next session.
5. **Re-export** — `.\scripts\analyze.ps1 -Export` dumps the current symbol map to
   `labs/notes/` so the analysis is reviewable in git.

## 6. Headless batch work

For a quick first pass without the GUI:

```powershell
.\scripts\analyze.ps1 -Binary C:\path\to\target.exe
```

This runs `analyzeHeadless`, imports the binary into a project under `labs/`, and
writes a function/string report next to it. Useful for triage, not a replacement for
sitting in the decompiler.
