# Architecture

`oszillator` is a pnpm workspace. Gameplay logic lives in framework-free packages; the browser app wires them to the DOM, Web Audio and Pixi. Packages are consumed from source (`src/index.ts`), so only the player app has a build step.

```
.osz ─► osz-loader ─► osu-parser ─► ruleset-std ─► renderer-pixi
        (worker)                    │   ▲             ▲
                                    │   └─ slider-geometry
                    audio-engine ───┴─ game time ─────┘
```

| Package | Responsibility |
| --- | --- |
| `core` | `Vec2`, playfield transforms, binary search, input event types. |
| `osu-parser` | Warning-first `.osu` parser. Unknown sections and malformed lines become warnings, never exceptions (only a missing format header throws). |
| `osz-loader` | Unzips an archive, parses every `.osu`, resolves audio/background/video/sample paths and computes the archive ID. |
| `slider-geometry` | Deterministic slider path sampling (linear, multi-segment bezier, perfect circle, catmull) and arc-length lookup. |
| `ruleset-std` | Turns a parsed beatmap into a `PreparedBeatmap` (mods, difficulty, combo colours, slider checkpoints), judges input (`RulesetStdGame`), scores, and drives autoplay (`AutoplayDriver`). No DOM or Pixi. |
| `audio-engine` | `WebAudioEngine`: plays an `HTMLMediaElement` through an `AudioContext` and exposes the authoritative game clock. |
| `renderer-pixi` | Draws prepared state with Pixi. It never parses beatmaps or judges anything. `@oszillator/renderer-pixi/visuals` exposes its Pixi-free constants and colour helpers. |
| `storage` | IndexedDB schema, migrations and repositories for the local library and scores. |

## Timing

Game time is derived from `AudioContext.currentTime` since playback started, scaled by the playback rate (DT/NC). It is never accumulated from animation-frame deltas. Inputs are stamped with the game time when they arrive, and judgement only advances through `RulesetStdGame.updateTo(time)` and input timestamps, so a run is deterministic for a given input sequence.

The one exception is the bundled showcase: browsers can refuse to start audio before a user gesture, so it may animate on a wall-clock `PreviewClock` until real audio takes over at the same position.

## Player app (`apps/player/src`)

`main.ts` owns application state and orchestration: beatmap selection, runs, the animation loop and control wiring. Everything else is a focused module:

- `ui/shell.ts` renders the static DOM and returns typed element references; `ui/hud.ts` renders score, judgement counts, the hit-offset chart and the break countdown; `ui/difficulty-list.ts` sorts and renders difficulties.
- `media/audio-track.ts` owns the page's single `WebAudioEngine`/`AudioContext` and the current audio blob URL; `media/stage-media.ts` owns the background image or muted video, which follows the game clock.
- `import-osz.ts` runs `workers/import-worker.ts`; `showcase.ts` builds the bundled showcase manifest and lazily fetches only the selected map's media.
- `cursor-effects.ts`, `preview-clock.ts`, `stage-layout.ts`, `local-library.ts`, `score-persistence.ts` and `prepared-beatmap-cache.ts` hold the remaining state.

Selections are serialised and only the newest request wins. Showcase downloads happen before a selection is queued, so a pending download never blocks a newer local import, and local archives never use the network path even if their filenames match a showcase.

## Hot paths and resource ownership

- Import runs in a worker. Asset bytes are transferred back to the page, not cloned, and a newer import terminates the previous worker. Parsed beatmaps do not retain raw section lines.
- The archive ID hashes only the first 4 KiB of the concatenated entries. It is an identifier, not an integrity hash.
- Prepared geometry is cached weakly per parsed beatmap and HardRock variant; HD/DT/NC reuse it.
- Per frame, the renderer finds visible objects by binary search (including long sliders/spinners that started earlier, via a cached running maximum of end times), skips fully transparent objects before activating a view, and does colour maths on packed numbers without allocating. Slider track strokes are built once per view and only retinted/refaded while visible; scale, radius or object changes rebuild them. Offscreen views release their geometry, and at most 64 empty views are pooled.
- Autoplay walks objects with a moving cursor instead of rescanning from the first object.
- Input callbacks only feed the game and record judgements. The HUD touches the DOM only when the score or hit history changed; the debug panel is throttled to 4 Hz.
- Changing beatmap or mods reuses the canvas and `AudioContext`; the same audio file reuses its media source. Stage media survives mod changes and is unloaded before its blob URLs are revoked.
- A finished run's score is snapshotted and written at most once per run, even if IndexedDB is slow; restarting starts a new run.
