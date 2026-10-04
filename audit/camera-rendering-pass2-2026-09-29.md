# Camera rendering pass 2 — local preview only

Test circuit: Calculator 0–9999 (+, −, ×), 1,155 parts and 2,605 wires. The baseline JavaScript/CSS were frozen before this pass; both versions ran in the same isolated in-app-browser benchmark origin. The user's saved browser project and the live site were not changed.

## Changes

- Reuse each node, wire, and junction's previous display state. Camera refreshes no longer write an unchanged `style.display` thousands of times.
- Cache conservative whole-wire bounds, including crossing curves and glow. Distant wires skip per-segment tests, and distant already-hidden path pieces skip repeat work. Visible crossing pieces, live signal updates, and selected/focused controls remain available.
- Split a long selected-wire highlight at turns into independently culled SVG pieces. Original line and curve commands, glow styling, hit geometry, bends, and endpoints remain intact.

On this calculator, the old visibility sweep inspected 11,926 path pieces. The new front/back sweeps made 1,770/2,237 piece-bound reads and 312/400 exact segment tests; repeating either sweep wrote zero display styles. The largest selected trace changed from one 136,465,280-world-pixel filter bound to five bounds totaling 849,728 (about 160 times less empty filtered area).

## Browser comparison

Numbers are one 120-frame run each, so use them to locate bottlenecks, not to claim stable FPS. Simulation and wire effects stayed on.

| Region / interaction | Baseline frame median / p95 | Current frame median / p95 | Baseline `applyView` total / worst | Current `applyView` total / worst |
| --- | ---: | ---: | ---: | ---: |
| Front, selected long wire, pan | 17.7 / 35.5 ms | 17.8 / 36.4 ms | 72.9 / 19.8 ms | 23.2 / 7.6 ms |
| Back, selected long wire, pan | 53.0 / 122.4 ms | 52.9 / 72.2 ms | 89.7 / 23.8 ms | 23.2 / 4.5 ms |
| Back, selected long wire, pan + zoom | 50.0 / 69.6 ms | 52.8 / 71.6 ms | 34.0 / 23.3 ms | 12.1 / 1.8 ms |

The camera JavaScript spikes are smaller, but the worst large-circuit area still takes about 50 ms per frame. This pass does **not** establish a consistent whole-frame or perceived smoothness improvement. That remaining cost is outside `applyView` in these runs; avoid removing glow, hiding signals, limiting circuit size, or freezing simulation as a shortcut. A test-only `#wires { will-change: transform; }` variant measured 50.0 ms median / 66.8 ms p95 for back-region pan versus 52.9 / 72.2 ms without the hint in one run. The difference is too small and variable to justify an extra 10,000×10,000 SVG compositor layer, so the hint was not shipped. A diagnostic that removed wire shadows was also slower in one run; it does not support blaming shadows alone.

## Verification

Focused panning/mobile/selected-trace regressions: 31 passing. The complete `node --test --test-isolation=none --test-reporter=dot tests/*.test.cjs` suite passed after regenerating the routing worker. No publish or push was performed.
