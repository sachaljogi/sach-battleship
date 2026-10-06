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
