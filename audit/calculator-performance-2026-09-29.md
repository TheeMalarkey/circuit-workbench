# Calculator performance pass — 2026-09-29

Scope: preserve every component, wire, input, editing feature, signal transition,
and timer duration. Local preview only; no publication or new circuit limits.
Fixture: the physical 1,155-part / 2,605-wire calculator, not an arithmetic
shortcut or simplified substitute.

## Changes

- An idle simulation update settles once, rather than settling the same circuit
  again at an arbitrary render-frame boundary. Button, forwarded-bit, Delay,
  Sustain, and latch deadlines still trigger a solve at their exact timestamp.
  The full simulation clock advances and timing lamps still paint every frame.
- Connectivity-cache validation compares saved geometry scalars, rather than
  allocating and serializing all nodes, endpoints, and bends every update.
  Direct in-place edits, rotation, reorder, and replacement still invalidate it.
- Synchronous connectivity builds and simulation passes reuse a validated node
  index. Standalone editor lookups retain mutation-safe first-match behavior.
- Wire endpoint geometry resolves each attached node once, not twice.
- Signal-paint change detection compares the actual pin arrays and instability
  flag instead of allocating JSON strings for every component.

No signal solver equations, routing layout, styles, wire filters, timer settings,
simulation frequency, or save format were changed. Existing instability warnings
and disconnected-wire behavior remain active. There is no hidden result cache.

## Behavioral verification

`scripts/performance-benchmark.cjs --baseline <saved-before-app.js> --parity-only`
compares complete input, external-drive, output, and instability states, plus
transition timestamps and detailed memory/timer checkpoints.

| Trace | Full-pin transitions | Detailed checkpoints |
| --- | ---: | ---: |
| Physical calculator: addition, negative subtraction, multiplication | 201 | 46 |
| Delay feedback and disconnection | 13 | 22 |
| Sustain feedback and disconnection | 5 | 12 |
| Sustain feeding memory | 5 | 7 |
| Buffer displaced-bit forwarding | 14 | 26 |
| Joined SR latch | 13 | 25 |
| Unstable inverter loop and disconnection | 2 | 5 |

Each trace must match the saved before-version exactly, not just its final
displayed number. Separate regression tests cover exact timer boundaries,
continuing lamp animation, unchanged topology without serialization, 28 geometry
mutations, and drawing-cache invalidation. The physical calculator test also
disconnects its answer bus and verifies the displayed answer no longer follows
the stored memory.

Final-source comparison passed: **253 complete-pin transitions and 143 detailed
checkpoints identical** across all seven scenarios.

## Reproduce performance measurements

- Engine: `node scripts/performance-benchmark.cjs --baseline <saved-before-app.js> --timing-only --samples 80 --active-samples 3`
- Browser: `node scripts/camera-benchmark.cjs --baseline <saved-before-app.js> --port 8786`
- Open the benchmark on its isolated test origin with
  `?camera-bench=baseline&design=calculator-9999&region=back`, then repeat with
  `camera-bench=current`. `region=front` exercises the keypad/display area.
- The benchmark offers pan and combined pan/zoom. Keep the wire-filter checkbox
  unchecked. Its output records whether simulation is running; reset starts it.

Engine numbers exclude rendering and persistence and are not browser FPS.
Browser measurements use the normal camera handlers with repeatable synthetic
motion. They are not a substitute for the user's physical mouse/touch acceptance.

## Engine measurements

Same-machine before/after run, 80 idle calls in eight batches and three active
samples following an untimed warmup:

| Measurement | Before | After |
| --- | ---: | ---: |
| Median idle CPU per call | 14.10 ms | 10.95 ms |
| Median idle elapsed time per call | 14.062 ms | 8.070 ms |
| Median active workload CPU | 6,298 ms | 6,485 ms |
| Median active workload elapsed time | 6,235.756 ms | 6,287.334 ms |

Idle elapsed time fell about 43%; process CPU fell about 22%. There is **no
claimed active-calculation speedup**: the complete entry/capture/multiplication
workload was about 0.8% slower in elapsed time and 3% higher in process CPU in
this sample. The largest remaining active costs are genuine propagation and
memory events, which this pass deliberately leaves semantically unchanged.

The isolated unchanged-topology check also measured 3.25 → 1.17 ms per call.
Cold topology construction was not demonstrated faster. Do not extrapolate
these figures to all circuit sizes, hardware, or browser frame rates.

## Browser observations

In-app browser, rear calculator region, normal rendering and wire filters,
simulation running, 24 warmup frames followed by 120 measured frames per run:

| Variant | Motion | Median frame | 95th percentile | Frames over 33.5 ms |
| --- | --- | ---: | ---: | ---: |
| Before, first run | Pan | 50.0 ms | 66.7 ms | 94 |
| After, first run | Pan | 33.4 ms | 66.8 ms | 44 |
| Before, repeat | Pan | 33.5 ms | 50.1 ms | 59 |
| After, repeat | Pan | 33.4 ms | 66.6 ms | 54 |
| Before, first run | Pan + zoom | 49.9 ms | 66.6 ms | 67 |
| After, first run | Pan + zoom | 33.3 ms | 50.0 ms | 17 |
| Before, repeat | Pan + zoom | 33.4 ms | 50.0 ms | 43 |
| After, repeat | Pan + zoom | 33.4 ms | 50.1 ms | 54 |

The first comparison improved, but repeated pan results demonstrate substantial
browser variability: the median converged and the after-version's high-percentile
frame time was not consistently better. This is **not a proven general FPS
improvement or a complete panning fix**. Reducing idle engine work is established;
remaining browser stalls need a separate rendering profile, without sacrificing
wire detail or editing features.

## Final acceptance

- `node --test --test-isolation=none --test-reporter=spec tests/*.test.cjs`:
  **316 passed, 0 failed**, including mobile controls, wire editing/routing,
  calculator lifecycle, persistence, and physical disconnection tests.
- App and benchmark scripts pass Node syntax checks; `git diff --check` passes.
- `dist/app.js` and `dist/app-explorer.js` have identical SHA-256:
  `8EF5AF5B0660D63544A6BBBDE65C5D1A19A21B43194D8DC65AFF2570CE713FB9`.
- Routing worker regenerated and its source-parity regression passes.
- Stylesheet is byte-identical to the start of this pass.
- Browser measurements ran on an isolated test origin. The user's saved
  calculator was not manipulated; the benchmark tab and helper server were
  closed afterward. Normal port 8781 preview remains running.
- No commit, push, or production deployment performed.
