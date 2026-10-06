# Development notes

No real defects encountered as of 2026-10-05T23:55:42Z UTC.

## 2026-10-05T23:59:44Z — ESLint flat-config dependency

- Symptom: `npm run lint` could not load `eslint.config.mjs` because `@eslint/js` was missing.
- Cause: the declared `@eslint/js@10.12.0` version does not exist in the npm registry; its release version is independent of ESLint's.
- Fix: install the published `@eslint/js@10.0.1` package and refresh the lockfile.
- Covering check: `npm run lint`.

## 2026-10-06T00:06:11Z — Production build stall

- Symptom: `npm run build` remained at Vite's `transforming...` step while bundling the application.
- Cause: Rollup 4.64.0 stalled while bundling `react-dom/client` with React/ReactDOM 19.1.1; the same stall persisted with Vite 6.4.3.
- Fix: upgrade React and ReactDOM to 19.3.0 and Vite to 6.4.3, then refresh the lockfile.
- Covering check: `npm run build`.

## 2026-10-06T00:20:30Z — Board callback type mismatch

- Symptom: `npm run typecheck` rejected `BattleScreen` because `describeEnemyCell` accepted `CellView` while the shared Board callback type also included `PlayerCellView`.
- Cause: Board used a union callback type even when rendering a board with only one public cell-view type.
- Fix: make Board generic over the cell-view type supplied in its `cells` prop.
- Covering check: `npm run typecheck`.

## 2026-10-06T00:24:04Z — Vitest fake timers with React Testing Library

- Symptom: component tests timed out during user-event clicks when using `vi.useFakeTimers()`.
- Cause: React Testing Library advances fake timers in its async wrapper only when a global `jest` object is present; Vitest left its zero-delay timer pending without that alias.
- Fix: expose Vitest's `vi` object as `jest` in component-test setup and remove the alias during cleanup.
- Covering check: `npm test`.

## 2026-10-06T00:24:35Z — Reducer test import

- Symptom: `npm run typecheck` could not find `BOARD_SIZE` in `game/types`.
- Cause: the board-size constant is exported by `game/coordinates`.
- Fix: import `BOARD_SIZE` from `game/coordinates`.
- Covering check: `npm run typecheck`.

## 2026-10-06T00:25:06Z — Setup board hid placed ships

- Symptom: a placed ship appeared in the fleet list but its cells remained labeled empty on the setup board.
- Cause: `playerCellViews` read only from `playerBoard`, which is populated at game start rather than during setup.
- Fix: derive the player's public cells from `setup.ships` while the game is in setup.
- Covering check: `npm test`.

## 2026-10-06T00:29:04Z — Missing favicon on the deployed path

- Symptom: the browser reported a 404 while loading the app because there was no favicon.
- Expected: the favicon loads from `/sach-battleship/favicon.svg`.
- Cause: the HTML did not link a favicon and the project had no favicon asset.
- Fix: add `public/favicon.svg` and link it from `index.html`; Vite prefixes the absolute asset path with the configured base during build.
- Covering test: `e2e/smoke.spec.ts` checks linked asset responses, base paths, and browser console errors.

## 2026-10-06T00:29:04Z — Horizontal page overflow at 320px

- Symptom: at a 320px viewport with a vertical scrollbar, `documentElement.scrollWidth` was 320 while `clientWidth` was 305.
- Expected: the page itself should not scroll horizontally at narrow viewport widths.
- Cause: `body { min-width: 320px }` exceeded the document's available client width.
- Fix: remove the body minimum width and let the board's own scroll container handle any constrained content.
- Covering test: `e2e/smoke.spec.ts` asserts document width does not exceed client width at 320px.

## 2026-10-06T00:35:32Z — Browser asset assertion required a response-map entry

- Symptom: the Playwright asset assertion timed out with an undefined status while the production setup screen had loaded.
- Expected: every linked script and stylesheet asset should resolve under the Pages base path and return HTTP 200.
- Cause: the assertion treated a missing exact URL entry in the browser response map as a failed response.
- Fix: request an asset directly when the page response map has no matching entry, then assert its status.
- Covering test: `e2e/smoke.spec.ts` checks every asset URL and status.
