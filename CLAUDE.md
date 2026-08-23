# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — run the Vite dev server on port 3000 (host `0.0.0.0`)
- `pnpm build` — production build
- `pnpm preview` — serve the production build

- `pnpm test` — vitest (node env). Tests cover the pure logic: `hooks/conductorCore.test.ts` (clock/match/miss/seek rules with a fake clock), `utils/chart.test.ts`, `utils/launchkey.test.ts`, `utils/misc.test.ts` (key normalization, QWERTY layout, song import remap). Fixtures in `test/fixtures.ts`. Run this after touching any of those.

No linter/formatter is configured. TypeScript is not run as a separate step (Vite handles transpilation); to type-check manually use `pnpm exec tsc --noEmit`. If `pnpm`/corepack is broken locally, `npx pnpm@9 …` and `./node_modules/.bin/{vite,tsc,vitest}` work.

> Note: `README.md` and `vite.config.ts` reference a `GEMINI_API_KEY` / `.env.local` (boilerplate from the AI Studio template). **No Gemini/AI code actually exists in this app** — it is a pure WebMIDI tool and runs without any API key.

## What this app is

MidiStage is a browser-based live MIDI performance engine. It listens to a MIDI input device, maps incoming notes/CC (or computer-keyboard keys) to actions, and emits processed MIDI to an output device — intended for triggering chords, sequences, and glissandi live on stage. It relies on the **Web MIDI API** via the `webmidi` library, so it must run in a browser that grants MIDI access (Chrome). The UI is React 19 + Tailwind (loaded from CDN in `index.html`, not a build dependency).

## Architecture

### State model (single source of truth)
All application state lives in one `ProjectData` object held in `App.tsx` via `useState`. Songs/projects are brought in at runtime through import buttons in `Navigation.tsx` or the Saved Projects list in Settings (below). Saving is explicit — nothing is auto-saved. The only things in `localStorage` are the *name* of the last folder-loaded project (`midistage.lastProjectFile`, used to auto-restore it from the dev API on startup — see Game mode notes) and browser-local UI preferences (`midistage.prefs` via `utils/prefs.ts` — the Live-tab Launchkey/Grid view choice (switched on the Live tab) plus legend/LED/panel toggles edited in Settings → Interface; a legacy `midistage.liveView` key is migrated and removed on load). Game-tab display toggles live in `chart.settings` (per song, saved with the project). Without a dev server, reloading resets to `DEFAULT_PROJECT`.

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
Four top-level tabs in `App.tsx`: **Live** (`Performance.tsx`), **Game** (`GameMode.tsx`, see below), **Editor** (`Editor.tsx` + `components/editor/*` sub-editors for presets, sequences, scenes, mappings, CC, and the Game **Chart**), and **Settings** (device selection, global mappings). `Navigation.tsx` is the song list / import-export sidebar. The header's **⛶ Focus** button hides the sidebar and requests browser fullscreen for stage use (leaving fullscreen ends focus mode).

### Game mode (rhythm-game style live guide)
A fourth top-level tab, **Game** (`components/GameMode.tsx`), shows the song as falling notes so the performer doesn't have to memorize it. It is *not* a fixed-tempo rhythm game — the performer is the clock.

- **Chart model** (`types.ts` → `SongChart`, helpers in `utils/chart.ts`): `Song.chart` = `sections` (song form, sequential, each with a bar count and an optional `patternId`) × `patterns` (an N-bar grid of `ChartHit {mappingId, beat, durationBeats?}`), plus `lyrics` (`@bar[.beat] text` lines), an optional practice `audio` ref, `settings`, and recorded `takes`. `buildChartEvents(song)` flattens this into absolute-beat `ChartEvent`s (one per press) and assigns each sequence-lane event its `stepIndex`. "beat" = one beat of the song's time signature (`beatsPerBar`/`beatUnit`; 6/8 → 6 eighth-note beats per bar). Lanes = the mappings the chart references.
- **Conductor** (`hooks/conductorCore.ts` = pure, React-free state machine with an injectable clock — this is where every rule lives and what the tests exercise; `hooks/useConductor.ts` is a thin adapter owned by `App.tsx` that syncs song/events/settings, runs the 40 ms tick + 10 Hz snapshot, and wraps `<audio>` as an `AudioClock`): keeps the current position. Two positions matter: *raw* (anchor + elapsed at the estimated tempo, used for matching presses, capped to ≤ 1 bar past the waiting note) and *display* (with `holdForNotes`, freezes at the next pending note + `lateWindowBeats` until it's pressed). A matched press **snaps** the anchor to that note's beat (late/early presses shift everything), while tempo is adapted gently by regression over recent hits (`tempoFollow`). Notes are marked *missed* only by being overtaken by a later hit; same-beat notes in other lanes get a 350 ms grace so a slightly late second hand isn't treated as a miss. In **audio** mode the `<audio>` element is the clock and presses are only judged (real rhythm-game behavior). `App.dispatchTrigger` (the single press/release pipeline for keyboard, MIDI, mouse *and* take replay) calls `conductor.onPress(mappingId)` *before* the engine trigger; when `driveSequenceSteps` is on, the conductor sets the engine's STEP index to the chart's `stepIndex` (`useMidiEngine.setSequenceStep`) so the correct pitch plays even after skips/jumps. The conductor only engages once running — it auto-starts on the first hit *only while the Game tab is visible* (`setAutoStart`), so free practice on other tabs never lets the chart override sequence steps. The `conductor` returned by the hook *is* the `ConductorCore` instance (plus `attachAudioElement`), so its identity never changes and new core methods need no facade wiring; the 10 Hz `snapshot` is a separate return value. Judgment/combo readouts are gated by `core.isJudged()` (audio mode only — in LIVE the press is the reference).
- **Global actions** (`GlobalActionType` `CHART_*`, plus `TOGGLE_FOCUS`): bar/beat sync taps, skip/back note, bar ±, section ±, run/stop, restart, focus mode — mapped like any other global trigger (keyboard + MIDI pad) in Settings. Key names are normalized by `utils/inputCapture.normalizeKey` (`space`, `arrowleft`, …); a comma can never be a key because it's the list separator.
- **Recorder** (`hooks/useTakeRecorder.ts`): records trigger inputs (mapping id + relative ms) into `chart.takes`; replay feeds them through the same trigger pipeline. The Chart editor can quantize a take into a pattern.
- **Renderer** (`components/game/highwayRenderer.ts`): canvas, `requestAnimationFrame`, reads conductor refs directly (no React re-render per frame). Three layouts, switchable from the Game header: `device` (notes fall onto a Launchkey Mini MK3 keyboard/pads from `utils/launchkey.ts`), `keyboard` (onto a US QWERTY keyboard from `utils/qwerty.ts`, lanes = the mapped keys), and `lanes` (one column per mapping).
- **Launchkey view** (`components/LaunchkeyView.tsx`, geometry in `utils/launchkey.ts`): SVG of the controller (keys 48–72, drum-mode pads ch10 36–51: top row 40-43/48-51, bottom 36-39/44-47, knobs CC21–28) showing which key/pad each mapping sits on, what's pressed, and (when a chart is running) what to press next. Used on the Live tab (toggle "Launchkey / Grid").
- **Practice audio**: `vite.config.ts` has one `localFileApi` factory instantiated twice — `/api/projects` (JSON, validated) and `/api/audio` (binary, streamed, RFC 7233 Range requests) — both backed by gitignored `projects/`. The `<audio>` element is rendered by `App.tsx` (not the Game tab) so playback and the audio-mode clock survive tab switches. Client helpers in `utils/projectStorage.ts`. Dev-server only.
- **Auto-restore**: the last file loaded/saved via Saved Projects is remembered in `localStorage` (`midistage.lastProjectFile`) and re-loaded from the dev API on startup — only if the project is still the untouched default when the fetch resolves. Saving is still explicit.
- **Song JSON import** remaps chart ids too (`remapChart` in `utils/songImportExport.ts`) and carries `beatsPerBar`/`beatUnit`.
- `window.__conductor` is exposed by `App.tsx` in dev builds for debugging (`.debug()` dumps the clock state).

### Songs as code — `data/`
Bundled demo songs are **generated programmatically** (e.g. `createVolcanoSong()`), not loaded from JSON. `data/index.ts` exports `createAllSongs*` helpers. The original source JSON lives in `data/json-bak/`. `utils/songImportExport.ts` converts the legacy "Bank/Group" format (`convertOldBankToSong`) and handles JSON import/export — **import always regenerates all UUIDs** via an id map to avoid collisions.

## Conventions

- Comments and some identifiers are in **Korean**; match the surrounding language when editing a file.
- Channels are **1–16** in the data model; `midiChannel: 0` / `inputChannel: 0` means **Omni** (match any channel).
- Velocity in `NoteItem` is normalized **0–1**; CC and raw MIDI values are **0–127**.
- New ids are `uuidv4()` from the `uuid` package.
- The `@` import alias resolves to the project root (`vite.config.ts`).
