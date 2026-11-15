# Gameplay Compatibility Notes

- Difficulty formulas follow common stable approximations and may differ from exact osu! or osu!lazer edge cases.
- Slider judgement is deterministic and browser-player-oriented rather than score-compatible with official clients. The head must be hit inside the 50 window or the whole slider is a miss; afterwards each tick, repeat and tail is judged once, when its time is reached, against the held buttons and cursor at the next game update (so at frame granularity). The result is the share of parts collected: 95% for 300, 70% for 100, 40% for 50.
- Spinners count cursor rotation around the playfield centre only while a button is held; 3 rotations per second of spinner length gives a 300.
- Slider paths are sampled into fixed-tolerance polylines. Bezier sliders split into segments at repeated (red-anchor) control points; perfect-circle sliders with collinear points or a point count other than three fall back to bezier, as in osu!. Catmull curves use a uniform Catmull-Rom approximation.
- Legacy (v14 and older) slider shapes are supported; lazer-style mixed curve types inside one slider (format v128) are not.
- Hidden, HardRock, Double Time, and Nightcore are osu!standard-style modifiers, not official score-compatible replicas.
- HardRock applies common difficulty scaling and vertical mirroring.
- Double Time uses 1.5x playback and clock scaling with browser pitch preservation enabled.
- Nightcore uses the same 1.5x gameplay timing as Double Time and disables pitch preservation, but does not yet add osu!'s extra nightcore drum track.
- Hidden uses renderer-side fade behavior.
- Autoplay (`AutoplayDriver` in `ruleset-std`) injects idealised inputs through the normal judgement path and is excluded from local score persistence.
