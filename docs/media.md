# Demo Media

Use lightweight media in git and host full recordings elsewhere.

## Recommended README Flow

1. Record a product demo locally.
2. Export a small poster image and commit it under `docs/assets/`.
3. Upload the full video to YouTube, GitHub Releases, or another stable public host.
4. In `README.md`, show the poster image and link it to the hosted video.

GitHub README files do not support arbitrary embedded YouTube iframes. The most reliable pattern is a clickable poster:

```md
[![Watch the oszillator demo](docs/assets/demo-poster.jpg)](https://www.youtube.com/watch?v=0RBsNySsgOs)
```

## Current Assets

- `docs/assets/demo-poster.jpg`: lightweight poster extracted from the local autoplay recording.
- YouTube demo: https://www.youtube.com/watch?v=0RBsNySsgOs
- `test-results/no-title.mp4`: local recording source, ignored by git.

Avoid committing large videos unless they are intentionally versioned release assets.
