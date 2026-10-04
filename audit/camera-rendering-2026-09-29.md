# Camera rendering investigation

The reported input is right-mouse drag. The user's local tab was on app version 106;
the separate Sites-hosted tab was still on version 92. This repair is local version
107, not a production release.

Each SVG wire layer combined multiple disconnected runs into one filtered path.
Its shadow/glow surface therefore included large empty rectangles between those
runs. Panning calculations were fast, but drawing newly exposed areas stalled.

The renderer now separates sparse, large filter surfaces along existing SVG move
commands, keeps compact paths batched, and culls individual offscreen pieces.
Original path commands, crossing order, full-wire hit targets, glow/shadow styles,
selection and electrical model are retained.

## Browser measurements

The local-only `scripts/camera-benchmark.cjs` server freezes its starting JS/CSS
for comparison at `?camera-bench=baseline`. It appends a development benchmark
module; no benchmark controls are shipped in `dist`. Measurements use the actual
browser renderer, live simulation, 24 warmup frames and 120 measured frames.
The benchmark invokes the pan handler; it does not measure physical mouse input
latency. Browser frame timings include rendering and scheduling, and can vary.

| Circuit / motion | Before max frame | After max frame | Before p95 | After p95 |
| --- | ---: | ---: | ---: | ---: |
| 4-digit keypad, active 1234, regular pan | 100 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| 4-digit keypad, faster 1200px sweep | 116.6 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Pong, 15% zoom, 400px sweep | 83.3 ms | 33.5 ms | 16.8 ms | 33.4 ms |

All runs had a median frame time of 16.7 ms. Pong's longest stalls improved,
but its p95 did not: this is not a claim of consistent 60 FPS in every area.
Turning wire filters off experimentally also removed the keypad stalls; the
final change preserves those filters. The final fast-keypad comparison was run
after the Node test suite finished, to avoid simultaneous benchmark/test load.

## Verification

- 241 automated tests pass, including exact wire geometry/crossing ordering,
  viewport culling, signal updates, selection, gestures, and simulator logic.
- New coverage checks that sparse filtered runs get bounded separately, compact
  runs remain batched, and offscreen runs are hidden without losing full-wire
  selection or hit targets.
- `app.js` and `app-explorer.js` have identical hashes; syntax checks pass.
- Reloaded the user's local preview with version 107; the saved circuit and
  camera position were retained. Inspected the original adder region visually.
