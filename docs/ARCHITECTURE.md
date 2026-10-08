# How the game works

Behind the screen, a rules engine—the referee—decides which moves are allowed and what happens next. The screen shows the referee's decisions, so the game rules are not duplicated in several places.

## The four parts of a game

1. **Set up the fleet.** Place all five ships yourself or let the game arrange them. Play cannot start until every ship is placed.
2. **Your turn.** Choose a square on the enemy board that has not been fired on before. A hit and a miss both use up your turn.
3. **The computer's turn.** After a short pause of about 0.6 seconds, the computer fires at one untried square on your board.
4. **Game over.** Play stops as soon as either fleet is sunk. The winner is announced and the enemy's remaining ships are shown. “Play again” starts a fresh setup.

The referee checks every move, including whether it is the right player's turn and whether a square has already been used. The screen also marks unavailable squares so they cannot be chosen by mistake.

## How the computer chooses shots

The computer sees only what a player could know: which squares have been fired on, whether each shot hit or missed, and the locations of ships that have already sunk. It is never given the hidden locations of ships still afloat.

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square. After a hit, it checks the four neighboring squares—up, down, left, and right. If several hits line up, it tries the open ends of that line. Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets.

Because the computer sees only this public information, it has no advantage from knowing where the unsunk ships are hidden.

## Why delayed moves are guarded

The pause before the computer fires lets the screen show that it is thinking. That delayed move carries the number of the game and the number of the turn for which it was planned. Think of it as a letter postmarked with both numbers: if the game has restarted or moved on, the referee throws the old letter away instead of applying it.

When a game resets, the screen leaves the computer's turn, or the screen closes, the waiting move is cancelled. The referee still checks the game and turn numbers when a move arrives, as a second safeguard in case cancellation was too late. In development, a safety check sets up and cleans up the screen's delayed work twice; cancelling the first wait ensures only one computer move is scheduled.

## How the session leaderboard keeps score

The leaderboard is a separate scorekeeper that sits beside the referee rather than inside it. The referee only runs one game at a time and knows nothing about earlier games; the scorekeeper watches for the moment a game ends and writes one line in its ledger.

The ledger (`SessionStats`) holds the number of games played, wins, losses, the current win streak, the best win (fewest shots), the list of finished games, and a note of the last promotion. Adding a result is a pure function, `recordGame(stats, result)`: it takes the old ledger and a result and returns a new ledger without changing the old one. The result it needs is small—which game number it was, who won, and how many shots each side fired—so other features (for example a coin reward or a best-of-three series) can read the same result and keep their own ledgers alongside this one.

Each result carries the game number (`matchId`). The scorekeeper refuses to write the same game number twice, so a game is counted exactly once even when the screen is set up twice by the development safety check or redraws itself after the game is over.

Ranks are awarded by total wins in the session. The four steps—Recruit at 0 wins, Ensign at 1, Captain at 3, Admiral at 6—are defined once in `RANK_THRESHOLDS`, so changing the ladder is a one-line edit. When a win crosses a step, the ledger notes the game number and new rank; the screen turns that into a visible "Promoted to …!" line and a spoken announcement for screen readers, but only while that winning game is still on screen.

The ledger is saved to the browser's session storage after every change and read back when the page loads. Session storage lives as long as the browser tab, so a refresh keeps the scores and closing the tab clears them. Saved data is checked before use; anything that does not look like a ledger is ignored and the scores start fresh. The "already recorded" game number is not restored from storage, because game numbers restart at 1 after a refresh.

## Terms used in the code

- **Rules engine (referee):** `reducer` — accepts legal moves and updates the game.
- **Game number:** `matchId` — changes when a fresh game starts.
- **Turn number:** `turnId` — advances after each accepted shot.
- **Public information shown to the computer:** `AiView` — contains shot results and already-sunk ships, not the hidden fleet.
- **Development safety check:** `Strict Mode` — repeats setup and cleanup to help catch mistakes.
- **Scorekeeper ledger:** `SessionStats` in `src/game/stats.ts` — the session's results; `recordGame` adds one finished game.
- **Rank ladder:** `RANK_THRESHOLDS` — the wins needed for each rank.
- **Scorekeeper bridge:** `useSessionStats` in `src/hooks/useSessionStats.ts` — records a game when the referee reports game over and saves the ledger to session storage.
- **Leaderboard panel:** `Leaderboard` in `src/components/Leaderboard.tsx` — shows the rank, record, streak, best win and recent games.
