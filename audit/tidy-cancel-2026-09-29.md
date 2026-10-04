# Tidy cancellation, local v113

Removed the production wall-clock deadline, cumulative work budget, and main-thread worker watchdog. Tidy can keep working in the background until it completes, cannot find a valid route, hits an existing memory/search-structure safeguard, or is cancelled.

The active Tidy button becomes Cancel tidy and remains clickable. Cancellation terminates the worker, rejects its pending result, ignores any late message, and applies no unfinished edits. A second click before worker startup cancels the queued job as well. The memory warning now says Memory safeguard instead of the ambiguous Limit reached.

Explicit injected budgets remain available for deterministic diagnostic tests, but neither normal routing nor the generated worker enables them. Existing heap/state/cache and routing-grid size safeguards remain.

Browser verification: started routing on the larger local test circuit, observed Cancel tidy, clicked it, and observed Cancelled with Undo still disabled. Unit coverage includes worker termination, no deadline timer, ignored late completion, and queued cancellation. Nothing published.
