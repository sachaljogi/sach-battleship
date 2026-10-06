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

## Verification summary

The summary below will be filled after the Phase 3 checks run.

- `npm run typecheck` — pending
- `npm run lint` — pending
- `npm test` — pending
- `npm run build` — pending
- `npm run test:e2e` — pending
- `npm audit` — pending
- Date: pending
- Tested revision: pending (code commit; documentation-only commits may follow)

## Deployed-site check

_Pending — to be completed after deployment._

## Limitations

- Games are not persisted; refreshing returns to setup.
- This is single-player against a hunt-and-target AI, not online multiplayer or probability-density search.
- Manual screen-reader testing has not been performed.

## Manual testing findings
