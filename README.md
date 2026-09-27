# Circuit Workbench

A browser-based logic circuit simulator inspired by Lumber Tycoon 2. Build with gates, timing components, memory, segmented displays, plain wires, and neon wires, or explore editable example circuits.

## Play

The public site is hosted on GitHub Pages. No account or installation is needed to use the simulator.

Circuits save in your browser on this website address. Use the save icon to export backups or import circuits from another browser or the previous site. Saves do not automatically move between website addresses or devices.

## Preview changes

From this folder, run:

```sh
python -m http.server 8781 --directory dist
```

Open http://127.0.0.1:8781/. Changes stay in this local preview until a release is manually published.

The editable application is `dist/app.js`. Copy it to `dist/app-explorer.js` after editing; the page loads that matching copy. Run `node --test tests/*.test.cjs` to check the simulator.

## Publish an approved update

Pushing code runs checks but does **not** deploy the website.

After testing and approval, open **Actions → Publish site → Run workflow**, choose `main`, and run it. The action tests the simulator and deploys only the `dist` folder. In repository Settings → Pages, the source must be **GitHub Actions**.

To roll back, revert the unwanted changes on `main`, then manually run **Publish site** again.
