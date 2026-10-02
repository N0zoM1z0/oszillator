# Architecture

`oszillator` is split into browser-focused packages so the web-player UI stays separate from osu!standard-style gameplay logic.

- `apps/player` owns UI, local import, Web Audio orchestration, and Pixi canvas lifecycle.
- `packages/osz-loader` unzips local `.osz` archives and builds an asset manifest.
- `packages/osu-parser` parses `.osu` text with warnings instead of brittle failures.
- `packages/ruleset-std` converts parsed beatmaps into deterministic runtime state, modifiers, judgement, and scoring.
- `packages/renderer-pixi` consumes prepared state and renders gameplay visuals. It does not parse `.osu`.
- `packages/audio-engine` exposes the authoritative gameplay clock through Web Audio.
- `packages/storage` persists metadata, settings, and local scores.

Gameplay time is derived from Web Audio, never animation frame deltas. Parsing and import work run off the UI thread where practical, while renderer hot paths receive prepared data only.

## Hot paths and resource ownership

- Archive IDs hash the same concatenated 4 KiB prefix as before, without expanding complete assets into number arrays. They are identifiers, not integrity hashes. Import workers transfer unique asset buffers back to the player instead of cloning them.
- Input callbacks only update gameplay and record judgements. The animation loop updates score/HUD when score state or hit history changes; debug output remains throttled. Stage dimensions and input transforms refresh on resize, not every pointer event.
- Local score persistence takes an immutable result snapshot and claims one write attempt per run before awaiting IndexedDB. Restarting opens a new run; an old pending write cannot unlock it. Failures are reported once, rather than retried every frame. Database connections close after each operation; the storage schema is unchanged.
- Prepared geometry is cached weakly by parsed beatmap and HardRock variant. HD/DT/NC reuse it. Pixi caches the three slider track strokes while visible, updating tint/opacity/position without rebuilding paths. Scale, radius or prepared object changes invalidate geometry. Offscreen views release geometry and at most 64 empty views are pooled; replacing prepared geometry destroys prior views.
- Beatmap/mod selection reuses the canvas and AudioContext. The same manifest/audio path reuses its media source; different audio replaces and disconnects the old element. Stage media survives mod changes, resets to the beginning, and is unloaded before its object URLs are revoked on replacement.
- Showcase boot fetches difficulty metadata first and only the selected media. Asset requests are deduplicated, failed requests can retry, and downloads do not block the resource-mutation queue. Stale selections cannot start playback after a newer local import. Local archives never enter this network-loading path, even if filenames match a showcase.
