# Architecture

`oszillator` uses a browser-first package split:

- `apps/player` owns UI, drag and drop, Web Audio orchestration, and Pixi canvas lifecycle
- `packages/osz-loader` unzips local `.osz` archives and builds an asset manifest
- `packages/osu-parser` parses `.osu` text with warnings instead of brittle failures
- `packages/ruleset-std` converts parsed beatmaps into deterministic prepared runtime state and scoring logic
- `packages/renderer-pixi` visualizes prepared state only
- `packages/storage` persists metadata, settings, and local scores

Heavy parsing and preprocessing are designed to move into workers. Gameplay time is derived from Web Audio, never frame deltas.
