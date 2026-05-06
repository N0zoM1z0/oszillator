# Architecture

`oszillator` is split into browser-focused packages with clear gameplay boundaries.

- `apps/player` owns UI, local import, Web Audio orchestration, and Pixi canvas lifecycle.
- `packages/osz-loader` unzips local `.osz` archives and builds an asset manifest.
- `packages/osu-parser` parses `.osu` text with warnings instead of brittle failures.
- `packages/ruleset-std` converts parsed beatmaps into deterministic runtime state, modifiers, judgement, and scoring.
- `packages/renderer-pixi` consumes prepared state and renders gameplay visuals. It does not parse `.osu`.
- `packages/audio-engine` exposes the authoritative gameplay clock through Web Audio.
- `packages/storage` persists metadata, settings, and local scores.

Gameplay time is derived from Web Audio, never animation frame deltas. Parsing and import work run off the UI thread where practical, while renderer hot paths receive prepared data only.
