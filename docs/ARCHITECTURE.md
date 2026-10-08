# How the game works

Behind the screen, a rules engine—the referee—decides which moves are allowed and what happens next. The screen shows the referee's decisions, so the game rules are not duplicated in several places.

## The four parts of a game

1. **Set up the fleet.** Place all five ships yourself or let the game arrange them. Play cannot start until every ship is placed.
2. **Your turn.** Choose a square on the enemy board that has not been fired on before. A hit and a miss both use up your turn.
3. **The computer's turn.** After a short pause of about 0.6 seconds, the computer fires at one untried square on your board.
4. **Game over.** Play stops as soon as either fleet is sunk. The winner is announced, coins are awarded, and the enemy's remaining ships are shown. “Play again” starts a fresh setup for the next game of the series.

The referee checks every move, including whether it is the right player's turn and whether a square has already been used. The screen also marks unavailable squares so they cannot be chosen by mistake.

## How the computer chooses shots

The computer sees only what a player could know: which squares have been fired on, whether each shot hit or missed, and the locations of ships that have already sunk. It is never given the hidden locations of ships still afloat.

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square. After a hit, it checks the four neighboring squares—up, down, left, and right. If several hits line up, it tries the open ends of that line. Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets.

Because the computer sees only this public information, it has no advantage from knowing where the unsunk ships are hidden.

## Gold coins and series

Think of the referee as also keeping a small scorecard next to the board. The scorecard has three things on it: the player's gold coin total, the current series (how many games each side has won, and whether the series is decided), and a list of finished series.

- A series is best-of-three: the first side to win two games takes it, so a series lasts two or three games.
- When a game ends, the referee updates the scorecard in the same step that declares the winner. A game won by the player is worth 1 coin. If that win also decides the series, a bonus of 3 coins is added at the same time, and the finished series is added to the list.
- "Play again" keeps the scorecard: if the series is still open, the next game continues it; if the series is decided, a new series starts at 0 – 0. Abandoning a game with "New game" leaves the scorecard untouched.

The scorecard is part of the game state, so every rule about coins lives in the referee and is covered by the same tests as the rest of the rules. The screen only reads it: the yellow bar at the top shows the coin total and series score on every screen, the result screen explains what was earned, and the hidden announcement for screen readers says the same thing.

Saving is a thin layer outside the referee. Whenever the scorecard changes, the React hook writes it to the browser's local storage under one key, and reads it back when the page loads. Anything that does not look like a valid scorecard (missing, corrupted, or from a different version) is ignored and the player starts from zero. A game in progress is still not saved. Other features, such as a leaderboard, can read the same scorecard from the hook (`rewards`) without touching the referee.

## Why delayed moves are guarded

The pause before the computer fires lets the screen show that it is thinking. That delayed move carries the number of the game and the number of the turn for which it was planned. Think of it as a letter postmarked with both numbers: if the game has restarted or moved on, the referee throws the old letter away instead of applying it.

When a game resets, the screen leaves the computer's turn, or the screen closes, the waiting move is cancelled. The referee still checks the game and turn numbers when a move arrives, as a second safeguard in case cancellation was too late. In development, a safety check sets up and cleans up the screen's delayed work twice; cancelling the first wait ensures only one computer move is scheduled.

## Terms used in the code

- **Rules engine (referee):** `reducer` — accepts legal moves and updates the game.
- **Game number:** `matchId` — changes when a fresh game starts.
- **Turn number:** `turnId` — advances after each accepted shot.
- **Scorecard:** `Rewards` in `src/game/rewards.ts` — `coins` (total), `series` (`id`, `playerWins`, `aiWins`, `winner`), `history` (finished series with the coins each earned), and `lastAward` (coins earned by the game that just ended, used for the announcement).
- **Scorecard rules:** `recordGameResult` (called by the referee when a game ends) and `rewardsForNextGame` (called on “Play again” and “New game”); the amounts are the constants `COINS_PER_GAME_WIN`, `SERIES_WIN_BONUS`, and `SERIES_WINS_NEEDED` in the same file.
- **Saving the scorecard:** `src/hooks/rewardsStorage.ts` — `loadRewards` and `saveRewards`, using the local storage key `sach-battleship.rewards.v1`.
- **Public information shown to the computer:** `AiView` — contains shot results and already-sunk ships, not the hidden fleet.
- **Development safety check:** `Strict Mode` — repeats setup and cleanup to help catch mistakes.
