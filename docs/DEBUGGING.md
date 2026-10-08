# Debugging notes

This page records defects encountered while building the game. It does not claim the game is bug-free.

## Defects found

### Flat ESLint configuration could not load

- **Symptom:** `npm run lint` failed while loading the flat configuration.
- **Expected behavior:** The declared configuration dependencies should be installable and lint should start.
- **Cause:** The requested `@eslint/js@10.12.0` package version was not published; its version is independent of ESLint's.
- **Fix:** Use the available `@eslint/js@10.0.1` release and refresh the lockfile.
- **Verification:** `npm run lint`.

### Production build stalled during bundling

- **Symptom:** `npm run build` remained at Vite's `transforming...` step.
- **Expected behavior:** The production bundle completes.
- **Cause:** Rollup stalled while bundling `react-dom/client` with React/ReactDOM 19.1.1; updating Vite alone did not resolve it.
- **Fix:** Upgrade React and ReactDOM to 19.3.0 and Vite to 6.4.3.
- **Verification:** `npm run build`.

### Board callback types did not match

- **Symptom:** TypeScript rejected the enemy-cell label callback passed to the shared board.
- **Expected behavior:** A board callback should receive the public cell-view type supplied to that board.
- **Cause:** The shared callback accepted a union of player and enemy cell-view types.
- **Fix:** Make the board generic over its cell-view type.
- **Verification:** `npm run typecheck`.

### Vitest fake timers left user-event actions pending

- **Symptom:** Component tests timed out while waiting for clicks under fake timers.
- **Expected behavior:** RTL user-event actions and its async wrapper should finish with Vitest's fake timers.
- **Cause:** React Testing Library advances its zero-delay async-wrapper timer only when a global `jest` object is present.
- **Fix:** Expose Vitest's `vi` object as `jest` for component tests and remove the alias during cleanup.
- **Verification:** `npm test`.

### Reducer test imported the board size from the wrong module

- **Symptom:** TypeScript could not find `BOARD_SIZE` in `game/types`.
- **Expected behavior:** The reducer reveal test should compile against the module that exports the board dimensions.
- **Cause:** `BOARD_SIZE` is exported by `game/coordinates`.
- **Fix:** Import it from `game/coordinates`.
- **Verification:** `npm run typecheck`.

### Setup board hid placed ships

- **Symptom:** A placed ship was listed as placed, but its cells still appeared empty on the setup board.
- **Expected behavior:** The setup board reflects the fleet being placed before the match starts.
- **Cause:** Player cell views read from `playerBoard`, which is populated only when the match starts.
- **Fix:** Derive player cell views from `setup.ships` during setup.
- **Verification:** `npm test`.

### No favicon was linked for the deployed path

- **Symptom:** The browser reported a 404 while loading the page.
- **Expected behavior:** The app loads its favicon from `/sach-battleship/favicon.svg`.
- **Cause:** The HTML had no favicon link and the repository had no favicon asset.
- **Fix:** Add `public/favicon.svg` and link it from `index.html`; Vite applies the configured base path during build.
- **Verification:** `e2e/smoke.spec.ts` checks linked asset responses and paths, and collects browser console errors.

### Narrow viewport forced horizontal page scrolling

- **Symptom:** At a 320px viewport with a vertical scrollbar, document `scrollWidth` was 320 while `clientWidth` was 305.
- **Expected behavior:** The page itself should not overflow horizontally on narrow screens.
- **Cause:** `body { min-width: 320px }` exceeded the available document client width.
- **Fix:** Remove the body minimum width and let the board's own container manage constrained content.
- **Verification:** `e2e/smoke.spec.ts` checks that `scrollWidth <= clientWidth` at 320px.

### Browser asset assertion required a response-map entry

- **Symptom:** The Playwright asset check timed out with an undefined status while the production setup screen had loaded.
- **Expected behavior:** Every linked script and stylesheet asset should resolve under the Pages base path and return HTTP 200.
- **Cause:** The assertion treated a missing exact URL entry in the browser response map as a failed response.
- **Fix:** Request an asset directly when the browser response map has no matching entry, then assert its status.
- **Verification:** The passing `e2e/smoke.spec.ts` checks every asset URL and status.

### Game could silently stall on "AI is thinking..."

- **Symptom:** After the player fired, the screen stayed on "AI is thinking..." forever; nothing was logged and only New game recovered.
- **Expected behavior:** The computer always answers a player's shot, so the game can never be stuck in `aiTurn`.
- **Cause:** The delayed computer move only dispatched when the AI picked a square, and the referee returned the same state when that square was rejected (already used or off the board). With nothing changed, no new delayed move was scheduled. An `Rng` returning 1 or `NaN` made `randomInt` produce an out-of-range index, so `pick` returned `undefined` and the AI picked nothing.
- **Fix:** The referee now treats a rejected or missing computer shot as "fire at the first untried square" (deterministic, no randomness inside the reducer); if no untried square remains it hands the turn back to the player. `randomInt` clamps every result into range, so bad random numbers cannot produce holes in `shuffle` or an `undefined` pick. In development builds the referee logs a `console.warn` whenever a computer shot is rejected so the fallback is visible.
- **Verification:** Reducer tests for repeated, out-of-bounds, and missing AI shots; rng tests for `() => 1` and `() => NaN`; component tests that render `<App rng={() => 1} />` and `<App rng={() => NaN} />` and check that "AI is thinking..." clears after the delay. `npm test`.

## Verification summary

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 7 files, 49 tests.
- `npm run build` — passed; `dist/index.html` contains `/sach-battleship/favicon.svg`.
- `npm run test:e2e` — passed: 1 Chromium test. The initial run exposed an asset-response assertion gap; the assertion was fixed and the test passed on rerun.
- `npm audit` — passed: 0 vulnerabilities.
- Date: 2026-10-06 (UTC).
- Tested revision: `21755a49ca1b328cd716b71a568791406586508e` (application code and tests; documentation and workflow-only commits followed).

## Deployed-site check

Checked 2026-10-06 (UTC) against https://sachaljogi.github.io/sach-battleship/, deployed by the "Deploy to GitHub Pages" workflow run for commit `27f749b` (application code identical to the tested revision above). CI run 1 (typecheck, lint, unit tests, build, Playwright e2e) also passed on GitHub Actions for that commit.

- Fresh, unauthenticated contexts: a newly launched headless Chromium (no cookies or profile) and a Chrome Incognito window. The page returned HTTP 200 with no login prompt; every response was below 400 and no console errors were logged.
- Full match: one complete match driven through the real UI in headless Chromium by a script that clicked untried enemy cells. It ended after 58 player shots and 58 AI shots ("The AI wins."). All 17 of the player's ship cells were sunk, and the enemy's remaining ships showed as revealed unhit cells. A click on the enemy board after game over changed nothing.
- Play again returned a clean setup: no ships placed and Start disabled. A second match then started, and the AI replied to its first shot.
- Page refresh at `/sach-battleship/` reloaded the setup screen in both contexts.
- At 320px width, the document `scrollWidth` equalled `clientWidth` (no page-level horizontal scroll).
- By hand in Chrome Incognito:
  - placed the Carrier manually;
  - tried an out-of-bounds Battleship and saw the preview and error message, with the Carrier kept;
  - used Randomize and Start;
  - double-clicked an enemy cell and then clicked another during "AI is thinking...", which produced exactly one player shot and one AI reply;
  - fired with Enter and with Space after moving with an arrow key; the focus outline was visible;
  - refreshed the page.
- Not checked on the deployed site: a player win (it is covered by the component test "winning shot gets no reply"), real phones, browsers other than Chromium/Chrome, and screen readers.

## Limitations

- Games are not persisted; refreshing returns to setup.
- This is single-player against a hunt-and-target AI, not online multiplayer or probability-density search.
- Manual screen-reader testing has not been performed.

## Manual testing findings
