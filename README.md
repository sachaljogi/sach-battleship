[Live game](https://sachaljogi.github.io/sach-battleship/) · [Debugging guide](docs/DEBUGGING.md) · [Architecture guide](docs/ARCHITECTURE.md)

# Battleship

A browser Battleship game for one human player against an AI opponent.

## Rules

Place all five ships on your 10×10 fleet board. Ships may touch, but cannot overlap or extend beyond the board. Then take turns firing one shot at a time: a hit does not grant an extra turn. Sink all five enemy ships before the AI sinks yours.

While you set up, the game tells you what just happened: each placed ship is confirmed (for example "Carrier placed at A1. Next: Battleship."), and a placement that does not fit names the square you chose. Once all five ships are on the board, the board stops accepting clicks and the message changes to "All ships are placed. Press Start game to begin." Placed ships are locked; to rearrange them, choose Start over.

## Requirements

- Node.js 24, as selected by `.nvmrc`
- npm

## Run locally

```sh
npm ci
npm run dev
```

Vite prints the local URL when the server starts.

## Tests and code checks

```sh
npm test
npm run typecheck
npm run lint
```

The browser smoke test runs against a production build in Chromium:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

## Build and preview

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

The Vite base path is `/sach-battleship/`. While `npm run preview` is running on your own machine, open `http://localhost:4173/sach-battleship/` in your browser. This address works only on that machine; to play online, use the [live site](https://sachaljogi.github.io/sach-battleship/).

## Project structure

- `src/game/` — deterministic placement, shots, AI, and reducer
- `src/hooks/` — React game state and delayed AI turn
- `src/components/` — accessible setup, board, and battle screens
- `src/ui/` — user-facing cell and status messages
- `src/**/__tests__/` — engine, reducer, and component tests
- `e2e/` — Playwright browser smoke test
- `docs/` — architecture, debugging, and development notes

## How the AI works

The AI hunts on a checkerboard while those cells remain, then considers any untried cell. After a hit it tries the squares next to that hit, starting with its most recent hit. Once two or more hits line up, it always shoots the square just past one end of that line while such a square is still open; if both ends are blocked by a miss or the board edge, it tries the squares alongside the line (two ships may be lying side by side). It continues pursuing unresolved hits even if a different ship has already sunk. The AI receives only the public `AiView`—shot outcomes and information about ships already sunk—not the hidden fleet layout.

## Deployment

GitHub Actions runs typecheck, lint, unit tests, build, and a Chromium smoke test. A separate workflow publishes the production build to GitHub Pages when `main` is updated.

## Known limitations

- Games are not saved; refreshing the page returns to fleet setup.
- During setup, a ship stays where you put it. Once any ship is placed, Randomize is switched off and the only way to rearrange the fleet is "Start over", which begins a brand-new game.
- The game is single-player against the AI; there is no online multiplayer.
- The AI uses a hunt-and-target heuristic, not probability-density search.
- Board cells remain at least 24px wide; at very narrow widths they may be about 24–25px and the board can scroll within its own container.
- Manual screen-reader testing has not been performed.

## License

MIT. See [LICENSE](LICENSE).
