[Live game](https://sachaljogi.github.io/sach-battleship/) · [Debugging guide](docs/DEBUGGING.md) · [Architecture guide](docs/ARCHITECTURE.md)

# Battleship

A browser Battleship game for one human player against an AI opponent.

## Rules

Place all five ships on your 10×10 fleet board. Ships may touch, but cannot overlap or extend beyond the board. Then take turns firing one shot at a time: a hit does not grant an extra turn. Sink all five enemy ships before the AI sinks yours.

Every move has a 5-second clock. On your turn a countdown shows how many seconds remain; if it reaches zero, the game fires a sensible shot for you (an untried square, following up any hits) and tells you that time ran out. The AI also takes between 1.5 and 5 seconds to answer, and the same countdown shows when its shot is coming. Opening the "New game" confirmation pauses the clock until you choose "Keep playing".

While you set up, the game tells you what just happened: each placed ship is confirmed (for example "Carrier placed at A1. Next: Battleship."), and a placement that does not fit names the square you chose. Once all five ships are on the board, the board stops accepting clicks and the message changes to "All ships are placed. Press Start game to begin." Placed ships are locked; to rearrange them, choose Start over.

## Session leaderboard

Under the game, a "Session leaderboard" panel keeps score for as long as the browser tab stays open. It shows:

- **Rank** — Recruit (no wins yet), Ensign (1 win), Captain (3 wins), Admiral (6 wins). The thresholds live in one place in the code (`RANK_THRESHOLDS` in `src/game/stats.ts`). When a win earns a new rank, the panel shows "Promoted to …!" and a screen reader hears the same message.
- **Record (W–L)**, **win streak** (consecutive wins; a loss resets it to 0), **win rate**, and **best win** (the fewest shots you needed to win).
- A table of the five most recent games: game number, who won, and how many shots each side fired.

During a battle the panel shrinks to the rank, record and streak so it does not crowd the boards. The scores are saved in the browser's `sessionStorage`, so they survive a page refresh but are cleared when the tab is closed. Abandoning a game with "New game" does not count as a loss; only finished games are recorded.

## Gold coins and best-of-3 series

Games are grouped into short series: the first side to win two games wins the series (at most three games). The yellow bar at the top of the page always shows your gold coin total and the series score, for example "Series: You 1 – AI 1, game 3 of 3".

- Winning a game earns **1 gold coin**.
- Winning a series earns a **bonus of 3 gold coins** on top of the coins for the games.
- Losing a game or a series costs nothing; the coins you already have stay with you.

After each game the result screen tells you how many coins you earned and where the series stands. "Play again" continues the current series, or starts a new series once the previous one has been decided.

Abandoning a match counts as a loss: if you confirm "New game" while a game is in progress, the AI is given that game in the series (and wins the series if that makes two), and you earn no coins for it. The confirmation prompt warns you first, and the setup screen explains where the series stands afterwards.

Coins and the series score are kept for the current browser tab (session storage), so they survive a page refresh but reset when the tab is closed, matching the session leaderboard.

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

- `src/game/` — deterministic placement, shots, AI, reducer, and session stats
- `src/hooks/` — React game state, the 5-second move clock, the delayed AI turn, and leaderboard persistence
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

- A game in progress is not saved; refreshing the page returns to fleet setup. Gold coins, the series score and the session leaderboard are kept until the tab is closed.
- During setup, a ship stays where you put it. Once any ship is placed, Randomize is switched off and the only way to rearrange the fleet is "Start over", which begins a brand-new game.
- The game is single-player against the AI; there is no online multiplayer.
- The AI uses a hunt-and-target heuristic, not probability-density search.
- Board cells remain at least 24px wide; at very narrow widths they may be about 24–25px and the board can scroll within its own container.
- Manual screen-reader testing has not been performed.

## License

MIT. See [LICENSE](LICENSE).
