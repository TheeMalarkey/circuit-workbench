# Logic repair verification — 28 September 2026

This follows `logic-audit-2026-09-28.md`. The changes are local; GitHub Pages was not published.

## Corrected behavior

- Sustain establishes its hold before Selector and Buffer inputs sample edges. Releasing a still-active Sustain output no longer creates a hidden second write or advance.
- Wires that touch the same component port now form one electrical network, even when neither wire ends at that port. Plain crossings remain isolated.
- Repeating inverter feedback no longer presents an arbitrary phase as stable power. The affected circuit and wire are visibly marked unstable; downstream memory does not record an edge from an unsettled signal.
- Joined SR latch input selection uses the actual network paths and event state. Equivalent split or loose-end wiring and different frame partitions produce the same result in the tested scenarios.
- Latch selection, pending timers, button pulses, and memory pulses survive project reload. Undo/redo retain runtime state; adding an unrelated design does not reset an existing circuit. Reset inputs explicitly clears the latch.
- Selecting one wire shows all connected output sources and their current states. The readout explains shared-network power and marks unsettled feedback instead of calling an arbitrary phase on or off.

## Verification

- `node --test tests/*.test.cjs`: 195 tests pass, including new regressions for the five audited defects, source diagnostics, reset/undo, and malformed saved timing data.
- `node audit/design-audit.cjs`: no missing or extra graph edges, output shorts, or board overlaps in the five large designs; a 2,048-case 8-bit adder sample had no mismatch. Fault injection stops the counter and Pong clock, and the calculator's comparison light detects a disconnected gate path.
- `node audit/design-lights.cjs`: no sampled light discrepancies. Disconnecting a Pong pixel source turns off its neon wire while the producing gate remains on.
- Local browser preview served the updated JavaScript and CSS, loaded the counter example, and showed no console errors. Browser pointer automation could not reliably select a wire, so the readout's visual appearance is not claimed as manually verified. Its rendered text and live source changes were checked in a DOM regression test.

## Boundaries

These tests verify internal consistency and the supplied reference cases, not complete Lumber Tycoon 2 parity. Buffer simultaneous-write rules, unusual SR latch interactions, and arbitrary player-authored feedback networks remain provisional until compared with in-game recordings. The historical diagnostic scripts in this folder intentionally reproduce the *old* defects; use the regression suite for corrected-behavior checks.
