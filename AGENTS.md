# Circuit Workbench

- This checkout is the GitHub Pages project. The app is static and served from `dist`.
- Keep changes in local preview by default. Do not publish or dispatch `Publish site` unless the user explicitly requests a release.
- Ordinary pushes may run checks, but must never trigger production deployment. Keep the publishing workflow manual-only.
- Edit `dist/app.js` and synchronize `dist/app-explorer.js`, which is loaded by the page. Preserve existing browser saves and import compatibility.
- After editing `dist/app.js`, run `node scripts/build-routing-worker.cjs` to refresh the static background routing engine. Tests verify it matches the application source.
- Run checks appropriate to the change. A release runs the simulator suite and verifies the two JavaScript files match.
- Never include local recordings, credentials, previous hosting metadata, or build archives in the public repository.
