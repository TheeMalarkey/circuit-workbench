# Logic and built-in circuit audit — 28 September 2026

## Conclusion

There are genuine simulation defects, including invisible state transitions and apparent frozen feedback. The large built-in circuits are not secretly animated by a separate game engine or a forced-wire-power flag. They depend on the editable gates and connections. A correct-looking result is nevertheless not sufficient evidence that arbitrary circuits work correctly.

This was a diagnostic audit, not a repair. No application code, browser saves, or live release was changed during it. The pre-existing, uncommitted 14-segment corrections remain intact. Audit scripts execute isolated copies of the app in Node VM contexts.

## Confirmed defects, in recommended repair order

### 1. Sustain generates an invisible extra rising edge — high priority

Location: `dist/app.js:2005`, `2017–2023`, `2056–2078`.

Reproduction: lever → Sustain set to 2 → Selector 4. Turn on, advance 100 ms, then turn off. The selector advances on initial activation, as expected. It advances **again immediately on release**, despite Sustain's output and the selector's input both being true before and after release. The signal finally goes low at 500 ms.

The selector goes from zero-based channel 0 to 1 on activation, then to 2 on release instead of remaining at 1. Substituting Buffer 4's top `1` input causes stored bits to change from `1000` to `1100` on release: the same pulse writes twice. The wire's visible final state hides the extra event.

Cause: `resolveSignals` calculates a temporary low before the Sustain hold is installed. `settleTiming` commits memory input/edge changes before updating Sustain's hold. Its subsequent pass raises the signal and counts a fictitious new edge.

Evidence: `node audit/timing-repro.cjs`, records `SUSTAIN_PHANTOM_EDGE` and `SUSTAIN_PHANTOM_WRITE`. The three built-in Sustain comparison designs contain no downstream memory, explaining why their output checks missed this interaction.

Expected: apply the hold without exposing an intermediate low to downstream components; one uninterrupted high must produce one rising edge.

### 2. An unstable loop is presented as ordinary stable power — high priority

Location: `dist/app.js:1983–2011`; display consumers at `1373`, `1380–1381`.

Reproduction: connect an inverter output to its own input. Its recorded input is true while its output and the only feedback wire are false. Advancing 1 second leaves that contradictory state unchanged. Add one disconnected lever elsewhere: the same inverter input becomes false and its output/wire becomes true.

Cause: the solver stops after a pass limit based on the **total number of components**, returns the last intermediate state without an instability warning, and retains inputs from before its final output update. Unrelated components change the pass parity.

Evidence: `node audit/signal-repro.cjs`, record `nonconvergent inverter loop`.

Expected: detect and disclose oscillation/nonconvergence, rather than choose an arbitrary stable-looking on/off state. Disconnected components must not decide a loop's result.

### 3. Joined-input SR latch uses a wiring shortcut and depends on frame size — high priority

Location: `dist/app.js:1955–1969`, `2037–2044`, `2117`.

Topology reproduction: use the linked-latch preset, press the top button, then advance 800 ms. The latch finishes with bottom output active. Replace the wire's attached endpoint with the identical world coordinates, or split the same wire into two pieces without changing its electrical connections. It instead finishes with top output active. All variants validate and have identical connected input/output sets.

Timing reproduction: two pulses through Delay 1 into the linked latch, with identical inputs and elapsed time. At 675 ms, advancing in 200 + 200 + 50 ms chunks yields only bottom output active; advancing in 45 × 10 ms frames yields both outputs active. These step sizes are within the runtime's 200 ms cap.

Cause: `linkedLatchSourceSide` recognizes a direct source-to-input wire by endpoint metadata and compares edges with `values` from the last external simulation call. It is a hand-calibrated rule, not general propagation through the connection network. Internal events during a larger step can be classified differently.

Evidence: `node audit/signal-repro.cjs`, records `joined SR latch endpoint dependence`; `node audit/timing-repro.cjs`, record `LATCH_FRAME_DEPENDENCE`.

Expected: electrically equivalent representations and identical event timelines must produce equivalent behavior. The game's special joined-input behavior needs a general, independently validated model, not a rule recognizing a particular wire shape.

### 4. Shared physical port does not always join the wires touching it — high priority

Location: `dist/app.js:986–997`.

Reproduction: two wire interiors cross at the same inactive output nub. One wire has another active source. Both networks list the shared output nub, but the horizontal wire is on and the vertical is off. Split the vertical wire at exactly that nub, without changing its visible route: both wires become powered.

Cause: wire-to-wire merging checks endpoints first; component ports are attached separately afterward. A shared conductive port is not included in the union operation.

Evidence: `node audit/signal-repro.cjs`, record `two wire interiors touching same nub`.

Expected: a shared nub has one consistent electrical connection. Plain crossings without a nub or junction should remain separate.

### 5. Unrelated editor operations reset existing circuit state — medium priority

Location: `dist/app.js:1930`, `2144–2145`, `2207–2211`; persistent project serialization at `589`.

Reproduction: activate and release the bottom input of an SR latch; it correctly remembers bottom on. Add an unrelated preset. The old latch flips back to top on. Undoing a board move or saving/reloading also loses this latch state.

Cause: latch state is held only in a runtime map. `resetTiming` clears it, and preset addition and undo/redo call that global reset. Persistent model serialization does not include the latch's selected state. It also does not preserve pending timer events across reload.

Evidence: `node audit/root-integrity.cjs`, record `addingUnconnectedDesign`; `node audit/timing-repro.cjs`, records `LATCH_RELOAD` and `LATCH_UNDO_MOVE`.

Expected: adding a separate circuit should not reset the existing one. Save/reload and undo behavior should explicitly preserve intended state, or clearly explain any deliberate reset policy.

## What checked out

- All **182 existing tests pass**. That is a baseline, not a clean audit: they do not cover the failures above.
- Inventoried all **33 built-in designs**. Multiple-output networks occurred in the deliberate shared-source/latch diagnostic examples, not the five large functional designs checked below.
- Intended versus physical gate-to-input connections matched for the 4-bit calculator (68), 8-bit adder (139), counter (86), traffic controller (56), and Pong (252), excluding separately counted intended stacked-display contacts. No unintended output shorts were found in those designs.
- Removing the counter input stops counting. Removing the traffic selector input stops its sequence. Disconnecting a calculator XOR makes the answer wrong and lights its real mismatch wire.
- Disconnecting Pong's clock stops movement; disconnecting its vertical advance freezes vertical movement; disconnecting its hit signal prevents scoring.
- Removing every Pong-specific label and game metadata field and renaming all component/wire IDs produces the same 100-frame trace. No game-name bypass was found in the active solver.
- Pong's screen uses real network power: removing a pixel's source lead turns that neon pixel off even while its disconnected producing gate remains on.
- Physical neon outputs agreed with their producing gates across 16 counter states, 180 traffic samples, and 100 Pong frames / 30 ball pixels each.
- The 8-bit adder matched independently calculated arithmetic across **2,048 input samples**. Existing tests exhaust all 256 pairs for the 4-bit calculator and all 512 inputs for the built-in Full Adder.
- An instrumented shared-source wire painter actually switches its paths off after the last source goes off; the simple case does not retain stale glow.
- Held-input Delay/Sustain controls turn off on their scheduled times; held Selector/Buffer inputs do not repeatedly write just because time advances.

Evidence: `audit/design-audit.cjs`, `audit/design-lights.cjs`, `audit/root-integrity.cjs`, plus the existing suite.

## Important limitations and interpretation

- Ordinary OR feedback restarts from false between solves, whereas Sustain explicitly retains powered feedback. A self-fed Buffer ignores its own ordinary output because the self-driver filter also covers real outputs, not just forwarded pulses. These are demonstrated modeling inconsistencies/limitations; exact Lumber Tycoon 2 parity needs an in-game reference before selecting replacement behavior.
- A lit wire attached to an off source is not automatically wrong. Another connected source may power the same network. Stored memory, a selected selector channel, inverter output, or intentional Sustain feedback can legitimately remain on.
- The initial buffer write-conflict/pulse rules, some latch corner cases, and exact game timing are not comprehensively game-validated. Passing internal tests does not establish game parity.
- Pong still labels controls A/S/D, but the keyboard handler does not dispatch those keys to the paddle controls. Clicking the controls works; the labels currently overpromise keyboard support (`scripts/build-pong.cjs:14–16`, `dist/app.js:2385–2391`).
- This audit did not inspect every possible player-authored saved project or perform live in-game comparison. It used source inspection, independent expected results, topology invariance, fault injection, and isolated runtime tests.
- The live GitHub Pages signal network, rendering, timing/latch/solver, and preset-addition code was fetched read-only and compared to the audited local sections: those sections match. The confirmed defects are not confined to unpublished 14-segment edits.

## Recommended next work

1. Turn the counterexamples into regression tests asserting the intended behavior, not the current faulty result.
2. Fix Sustain event ordering, shared-port network merging, and convergence handling. Mark unstable circuits visibly instead of displaying arbitrary voltage.
3. Replace the linked-latch shortcut with topology- and event-based behavior; test wire splitting, coordinate endpoints, node order, frame sizes, and inactive components.
4. Preserve runtime state appropriately across editor changes and define save/restore behavior explicitly.
5. Add a wire inspector showing the actual driving outputs and feedback path. This would make legitimate held power distinguishable from a solver fault.
6. Re-run fault injection and independent circuit-output checks, then validate uncertain component behavior against the game before publishing.

Run diagnostics from the repository directory:

```powershell
node audit/signal-repro.cjs
node audit/timing-repro.cjs
node audit/root-integrity.cjs
node audit/design-audit.cjs
node audit/design-lights.cjs
node --test tests/*.test.cjs
```

The diagnostic scripts deliberately describe/reproduce current defects; they are not yet corrected-behavior release tests.
