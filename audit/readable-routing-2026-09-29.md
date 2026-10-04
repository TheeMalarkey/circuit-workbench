# Readable Tidy routing, local v110

First-stage implementation: group socket approaches by board edge and approach direction; assign staggered exits in physical socket order; route related source/destination groups together; penalize extra bends in simple candidate routes. Boards, socket identity, styles, and connectivity remain fixed. Existing crossing drawing is unchanged.

If ordered approaches cannot route safely, retry the prior router. Existing best-effort handling remains available. This is not yet a global lane-order optimizer or a rip-up/reroute cleanup pass.

Validation: ordered eight-input Full Adder fixture, model preservation, existing routing regressions, and browser import/Tidy inspection. Browser screenshot saved as ordered-adder-lanes-v110.png in the local temporary directory.

Known limitation: full planTidyWires on the compact four-digit keypad failed in both methods at the key6 / encode-4 fan-out, taking approximately 42 seconds in the diagnostic run. The test model remained unchanged. This case is not resolved by socket ordering and is not counted as passing acceptance. Future work should repair selected congested corridors without attempting the entire keypad at once, and bound search work to keep Tidy responsive.
