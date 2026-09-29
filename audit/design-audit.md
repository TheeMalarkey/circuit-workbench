# Built-in circuit audit

Read-only simulator audit, 2026-09-28. No production files changed. The pre-existing fourteen-segment changes were retained.

## Result

The five public built-in designs use their editable circuit components and physical wire networks. No hidden game engine or signal bypass was found. The precomputed route table caches wire geometry, not values or logical connections (`dist/app.js:187-190`). Pong metadata affects framing/copy grouping and legacy import migration, not current simulation (`1971-2122`).

The expected graph for Pong came from `buildPong().edges`; the other expected graphs came from explicit wire endpoint references. These were compared against every physical network's complete output-to-input relation, catching incidental geometry contacts as well as omitted wires.

| Design | Intended edges | Physical edges | Extra/missing edges | Shorted outputs |
| --- | ---: | ---: | ---: | ---: |
| Counter | 86 | 86 | 0 / 0 | 0 |
| Four-bit adder | 68 | 68 | 0 / 0 | 0 |
| Eight-bit adder | 139 | 139 | 0 / 0 | 0 |
| Traffic | 56 | 56 | 0 / 0 | 0 |
| Pong | 252 | 252 | 0 / 0 | 0 |

Stacked converter/display pairs deliberately use direct coincident contacts (14 contacts per two-digit display, 28 for the eight-bit bench). No other board overlap was found in the five designs.

## Independent checks

- 2,048 deterministic eight-bit input pairs: the decoded gate sum equals external JavaScript integer `a+b`, and all ten mismatch gates are off.
- Rename every Pong node/wire ID and remove labels, `arcade`, and `panel`: the 100-frame gameplay trace is unchanged.
- Remove counter input wires: counting stops at zero.
- Remove traffic selector input wires: it stays in all-red phase seven; actual neon networks reflect this state.
- Disconnect four-bit `p0` output wires at `1+0`: sum bit zero becomes false and the actual red mismatch neon powers on.
- Disconnect Pong `clock` output: ball and score stay zero. Disconnect `advance-ball-y`: vertical position stays zero while horizontal position advances. Disconnect `hit`: ball continues moving but score stays zero.
- Initial Pong `pixel-0-0` gate and neon are both on. Remove its source lead `pong-wire-676`: the gate remains on but the neon turns off, proving the display depends on the physical feed.
- Physical neon powers match producer outputs for every counter state, 180 traffic samples at 100 ms intervals, and 100 Pong frames with all 30 ball pixels checked each frame.

Run `node audit/design-audit.cjs` and `node audit/design-lights.cjs` from the project. All mutations happen in cloned VM models. These checks validate simulator consistency; they do not establish Lumber Tycoon 2 behavior or native browser rendering.

## Additional confirmed UI defect

Pong button labels advertise `LEFT · A`, `CENTER · S`, and `RIGHT · D` in `scripts/build-pong.cjs:14-16` and the generated `PONG_DESIGN` at `dist/app.js:544`, but the entire keyboard handler at `dist/app.js:2385-2391` only handles editing commands; A/S/D never call `pressButton`. The documented click controls still work. Either implement those shortcuts or remove the shortcut suffixes. This is unrelated to wire locking or hidden simulation.

## Existing test gaps

The traffic test named “neon outputs are distinct” checks color order and count only (`tests/traffic-light.test.cjs:92-100`). Arithmetic/counter checks mostly inspect computed gate values; this audit adds actual physical-neon checks and disconnection faults. Passing the current suite alone does not establish those dependencies.
