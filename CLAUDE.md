# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — run the Vite dev server on port 3000 (host `0.0.0.0`)
- `pnpm build` — production build
- `pnpm preview` — serve the production build

There is no test runner, linter, or formatter configured. TypeScript is not run as a separate step (Vite handles transpilation); to type-check manually use `pnpm exec tsc --noEmit`.

> Note: `README.md` and `vite.config.ts` reference a `GEMINI_API_KEY` / `.env.local` (boilerplate from the AI Studio template). **No Gemini/AI code actually exists in this app** — it is a pure WebMIDI tool and runs without any API key.

## What this app is

MidiStage is a browser-based live MIDI performance engine. It listens to a MIDI input device, maps incoming notes/CC (or computer-keyboard keys) to actions, and emits processed MIDI to an output device — intended for triggering chords, sequences, and glissandi live on stage. It relies on the **Web MIDI API** via the `webmidi` library, so it must run in a browser that grants MIDI access (Chrome). The UI is React 19 + Tailwind (loaded from CDN in `index.html`, not a build dependency).

## Architecture

### State model (single source of truth)
All application state lives in one `ProjectData` object held in `App.tsx` via `useState`. Reloading the page resets to `DEFAULT_PROJECT`; songs/projects are brought in at runtime through import buttons in `Navigation.tsx` or the Saved Projects list in Settings (below). There is no automatic/localStorage persistence — saving is explicit.

### Local project persistence (dev-server only)
`vite.config.ts` registers a `localProjectsApi` plugin exposing `GET/PUT/DELETE /api/projects[/<file>]` backed by the gitignored `projects/` folder. The frontend client is `utils/projectStorage.ts`, and the **Saved Projects** section in `Settings.tsx` lets the user list/load/save/delete whole `ProjectData` files there without browser download/upload dialogs. This only works under `pnpm dev`/`pnpm preview` (the middleware doesn't exist in a static production build); the UI falls back to a "use Import/Export" message when `/api/projects` is unreachable. Filenames are restricted to plain `<name>.json` basenames server-side to block path traversal.

The data hierarchy (`types.ts`) is:
```
ProjectData
├─ globalMappings / globalCCMappings   (active across all songs)
├─ selectedInputId / selectedOutputId  (MIDI device ids)
└─ songs: Song[]
   ├─ presets: NotePreset[]   (a NotePreset = a group of NoteItems + optional glissando)
   ├─ presetFolders
   ├─ sequences: Sequence[]   (ordered SequenceItems referencing presets/notes/sub-sequences)
   ├─ mappings: InputMapping[]    (note/key → preset|sequence|switch_scene|toggle_preset)
   ├─ ccMappings: CCMapping[]     (CC remap/range/curve processors)
   └─ scenes: Scene[]         (a scene = a subset of mapping ids that are active)
```
Mutations flow through `handleUpdateSong` / `handleUpdateProject` callbacks passed down as props; child components never own song state.

### The MIDI engine — `hooks/useMidiEngine.ts`
This is the heart of the app and the most complex file. It owns all note scheduling and the actual `playNote`/`stopNote` calls. Key concepts:

- **Reference counting** (`noteRefCountRef`, keyed `"channel-pitch"`): the same pitch may be held by multiple sources at once. Note Off is only sent to the device when the last holder releases; sending a new Note On while a note is held retriggers it (off→on) so the latest velocity wins. `stopAllNotes` (the Panic button) clears everything and sends All-Notes-Off CC 123 on all 16 channels.
- **Timers** (`noteTimersRef`, keyed by `sourceId_mappingId_triggerValue_noteId`): every scheduled note-on/note-off is a `setTimeout`; `preDelay` and `duration` drive them. `duration: null` means "play until release" — these are tracked as **sustained notes** (`sustainedNotesBySourceRef`) and cleared on release/reset.
- **Sequence modes** (`SequenceMode`): `AUTO` fires all items by beat position from BPM; `STEP` advances one item per trigger (stateful index per sequence); `GROUP` steps through sub-sequences or direct items. STEP/GROUP keep per-instance position refs and apply a 30ms debounce. `resetAllSequences` rewinds all indices (bound to the global `RESET_SEQUENCES` action).
- **Toggle presets** (`triggerTogglePreset`): latch a preset on/off with sustained notes; state in `togglePresetStateRef`.
- Glissandi are generated note-by-note in `runGlissandoInternal` (white/black/both key filtering, velocity ramp).

### Input → action dispatch
`App.tsx` wires raw MIDI/keyboard events to the engine in two `useEffect` hooks:
- **Global** mappings and the MIDI monitor live in `App.tsx` directly (listens on the selected input for `noteon`/`noteoff`/`controlchange`). CC processing (`processCCValue` + `applyCurve`) and output routing happen here for global+song CC mappings.
- **Per-scene/per-mapping** note & key dispatch happens inside `components/Performance.tsx`, which calls the `onTrigger` callback → `handleActionTrigger` in `App.tsx` → the engine's `triggerPreset` / `triggerSequence` / `triggerTogglePreset`. Press vs. release (`isRelease`) is threaded through everywhere because sustained/hold behavior depends on it.

### Device access — `webMidiService.ts`
A singleton wrapper around the `webmidi` library's global `WebMidi`. Provides `init()`, device lists, and `getInputById`/`getOutputById`. Imported directly wherever MIDI I/O is needed.

### UI surface
Three top-level tabs in `App.tsx`: **Live** (`Performance.tsx`), **Editor** (`Editor.tsx` + `components/editor/*` sub-editors for presets, sequences, scenes, mappings, CC), and **Settings** (device selection, global mappings). `Navigation.tsx` is the song list / import-export sidebar.

### Songs as code — `data/`
Bundled demo songs are **generated programmatically** (e.g. `createVolcanoSong()`), not loaded from JSON. `data/index.ts` exports `createAllSongs*` helpers. The original source JSON lives in `data/json-bak/`. `utils/songImportExport.ts` converts the legacy "Bank/Group" format (`convertOldBankToSong`) and handles JSON import/export — **import always regenerates all UUIDs** via an id map to avoid collisions.

## Conventions

- Comments and some identifiers are in **Korean**; match the surrounding language when editing a file.
- Channels are **1–16** in the data model; `midiChannel: 0` / `inputChannel: 0` means **Omni** (match any channel).
- Velocity in `NoteItem` is normalized **0–1**; CC and raw MIDI values are **0–127**.
- New ids are `uuidv4()` from the `uuid` package.
- The `@` import alias resolves to the project root (`vite.config.ts`).
