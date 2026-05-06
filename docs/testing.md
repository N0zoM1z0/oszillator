# Testing

Testing is layered:

- Unit tests cover parser behavior, timing, geometry, transforms, judgement, scoring, modifiers, and storage helpers.
- Browser tests cover boot, local import, playback controls, autoplay, modifiers, spinner rendering, and no-crash flows.
- Synthetic fixtures are used for committed tests.
- Local real-world `.osz` compatibility files stay ignored and outside the repository.

Every bug fix should add a regression test where practical.
