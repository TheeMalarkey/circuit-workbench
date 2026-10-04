# Unrestricted routing, local v114

At the user's explicit request, removed all explicit routing resource caps: optional work/deadline budget plumbing, heap/state/cache count aborts, routing-grid product cap, and wire-count cap. The generated worker uses the same unrestricted engine. Earlier watchdog removal remains in effect.

Background execution, manual cancellation, immutable-input checks, board clearance, electrical connectivity checks, and Undo remain. A search may still find no valid route. Browser/OS memory and execution limits cannot be removed; a difficult circuit may exhaust memory or crash the tab. No claim that the congested keypad now routes successfully.

Regression coverage replaces the old budget-stop test with a route exceeding the former 1000-wire cap, and verifies the removed cap/error code is absent. Existing cancellation and worker source-parity tests remain. No deployment.
