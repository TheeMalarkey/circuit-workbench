# Compact layouts and routing clearance

Local-only changes; no deployment or changes to existing browser projects.

- Router reserves a 12-unit margin around board footprints, including rotated boards. Only outward socket leads may enter that margin.
- Identical stacked display/converter footprints share their socket list.
- Reserve socket lead turn points so an earlier route cannot trap a later lead against its board.
- Validate final board clearance after routing. Simplification is accepted only if both clearance and electrical connectivity remain unchanged.
- Impossible groups retain existing best-effort behavior: they are left unchanged, not claimed to be repaired.

## Compact circuit authoring

`node scripts/compact-circuit.cjs decimal-keypad-4 audit/decimal-keypad-4-compact.json`

The developer tool removes unused horizontal/vertical strips while protecting board spans and wire lane spacing. It preserves socket references, grid alignment, and electrical networks. It does not replace built-ins or edit player saves. Existing crossings/shared stems are retained; it is not a general overlap repair tool.

Four-digit keypad: 10944 × 5028 becomes 6432 × 4836, a 43.5% bounding-area reduction. The separate JSON copy imports successfully in the browser.

## Follow-up: compact keypads in Circuit Explorer (v109)

All four keypad templates now apply strip compaction after retrieving cached routes. Saved circuits are not migrated or moved. Reopen the explorer after refreshing and add a fresh copy to obtain the compact template.

| Range | Previous footprint | Compact footprint | Area reduction |
| --- | --- | --- | --- |
| 0–9 | 3552 × 2304 | 2208 × 2016 | 45.6% |
| 0–99 | 5760 × 2304 | 3408 × 2160 | 44.5% |
| 0–999 | 8352 × 3348 | 4896 × 3252 | 43.1% |
| 0–9999 | 10944 × 5028 | 6432 × 4836 | 43.5% |

Additional regression verifies all four public templates match compact output and compaction introduces no new pairs of collinear overlapping wires. Existing shared socket stems remain unchanged. Decimal entry/binary output tests run against the compact templates. Route baking continues to cache the uncompressed coordinate space. The four-digit rendering snapshot was updated for the deliberate layout change; other geometry snapshots are unchanged.

## Verification

- All 248 tests pass with `node --test --test-isolation=none --test-reporter=dot tests/*.test.cjs`.
- New tests cover four board rotations, stacked display inputs, all built-in topology preservation, footprint preservation, and keypad parallel lane spacing.
- Browser: imported compact keypad on isolated localhost port 8784 and inspected layout; imported board-edge fixture, clicked Tidy, observed Done and visible clearance under the board.
- Application assets are byte-identical; local cache version 108. Existing player layouts remain untouched.
