# Testing

Testing is layered:

- unit tests for parser, timing, geometry, transforms, judgement, scoring, and storage helpers
- browser smoke tests for boot, import, debug compatibility view, and no-crash flows
- synthetic fixtures only; real copyrighted `.osz` files stay out of the repository

Every bug fix should add a regression test where practical.
