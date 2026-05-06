# Gameplay Compatibility Notes

- Difficulty formulas follow common stable approximations and may differ from exact osu! or osu!lazer edge cases.
- Slider judgement is deterministic and practice-oriented rather than score-compatible with official clients.
- Hidden, HardRock, Double Time, and Nightcore are osu!standard-style practice modifiers, not official score-compatible replicas.
- HardRock applies common difficulty scaling and vertical mirroring.
- Double Time uses 1.5x playback and clock scaling with browser pitch preservation enabled.
- Nightcore uses the same 1.5x gameplay timing as Double Time and disables pitch preservation, but does not yet add osu!'s extra nightcore drum track.
- Hidden uses renderer-side fade behavior.
- Autoplay is a local demonstration mode that injects idealized gameplay inputs and is intentionally excluded from local score persistence.
