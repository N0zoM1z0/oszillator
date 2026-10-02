# Testing

Testing is layered:

- Unit tests cover parser behavior, timing, geometry, transforms, judgement, scoring, modifiers, and storage helpers.
- Browser tests cover boot, local import, playback controls, autoplay, modifiers, spinner rendering, and no-crash flows.
- Synthetic fixtures are used for committed tests.
- Local real-world `.osz` compatibility files stay ignored and outside the repository.

Every bug fix should add a regression test where practical.

## Performance regression checks

Unit tests enforce bounded archive-prefix reads and compatible IDs, deduplicated worker transfers, score-save reentrancy/failure/new-run isolation, modifier geometry reuse, lazy asset request/retry behavior, and slider-cache invalidation and bounded resource pooling. Pure renderer visual helpers can be tested without loading Pixi or requiring a browser `navigator` in Node.

Browser tests hold IndexedDB completion across multiple frames and assert one saved score, observe that pointer movement leaves unchanged judgement-chart nodes intact, check resize/input alignment, count AudioContext/media-source creation across modifier/difficulty switches, verify selected-only showcase media loading, and hold a showcase download while importing a local archive. Two browser regression guards were confirmed to fail on the pre-optimization build before passing on the optimized build.

Playwright uses two workers by default to avoid GPU/media contention among many headless player instances. The ignored local `.osz` compatibility test is skipped when its external fixture is unavailable; committed tests generate synthetic data instead.

During optimization, seven deterministic synthetic scenes (approach, overlap, slider/spinner, HD, dynamic colours, HR, resize) were captured before and after the rendering change. All seven matched pixel-for-pixel in Chromium. These captures are local investigation artifacts, not copyrighted fixtures or cross-browser visual guarantees.

### Local measurements (2026-10-02)

Measured on the same Linux workspace, with Node 20.20.2 and headless Chromium 147. Import measurements use three isolated processes and a synthetic 16 MiB opaque asset; browser input/storage probes use generated `.osz` files. Network measurements disable HTTP caching and service workers, using the pre-existing local showcase assets without adding them to the repository.

| Probe | Before | After |
| --- | --- | --- |
| Manifest construction, 16 MiB asset | 3.27–3.92 s; ~650 MiB heap growth | 0.55–0.81 ms; <0.3 MiB heap growth; identical ID |
| 300 pointer events, unchanged 56-entry hit history | 300 chart mutations; ~262 ms total dispatch | 0 chart mutations; ~30 ms total dispatch |
| Score persistence with IndexedDB success delayed 250 ms | 21 opens / 21 saved records | 1 open / 1 saved record |
| Showcase assets fetched before first selection is ready | 31.74 MiB | 2.13 MiB |
| 500-slider scene, late playback, instrumented dev renderer | ~43 track builds/frame; 0.96 ms mean `renderFrame` | ~3.2 track builds/frame; 0.64 ms mean `renderFrame` |

These are investigation samples, not timing assertions or FPS promises. Headless GPU scheduling and wall-clock playback produced different frame counts between samples; large circle-only scenes were mixed, not consistently faster. The stable regression oracles are bounded prefix consumption, unchanged DOM nodes, one save per run, retained resource identity, and no repeated slider-path construction while geometry is unchanged. Archives are still unzipped fully in memory, and dynamic heads, approach rings, spinner effects and cursor visuals still redraw.
