# Background Tidy v111

The supplied screenshot confirms a renderer crash, but does not identify its cause. Routing was a plausible contributor: a previously observed 42-second search ran synchronously and fallback recursively retried groups without a shared total budget.

UI Tidy now runs a generated static engine in a disposable Web Worker. It shares a 10-second / 300000-work budget across routing attempts, limits search structures, and has a 12-second main-thread termination watchdog. Completed independently validated groups can be returned as partial progress; unfinished paths are never applied. Edits or project switches invalidate the result. No synchronous fallback is used if worker startup fails.

Browser checks: ordered adder returns Already tidy through the worker. Large compact keypad remains responsive enough to pause while routing, then returns Limit reached without crashing in this run. This establishes a safe-stop path, not successful full-keypad routing or proof of the original crash cause. Full keypad congestion remains unresolved.

Regenerate with node scripts/build-routing-worker.cjs whenever app.js changes. Generated-engine parity is covered by tests. No deployment performed.
