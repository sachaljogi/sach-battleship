# How the game works

Behind the screen, a rules engine—the referee—decides which moves are allowed and what happens next. The screen shows the referee's decisions, so the game rules are not duplicated in several places.

## The four parts of a game

1. **Set up the fleet.** Place all five ships yourself or let the game arrange them. Play cannot start until every ship is placed. A ship is locked the moment it is placed: its entry in the fleet list is greyed out, and the referee refuses any attempt to move it. “Randomize” only works while the board is still empty. To rearrange ships you press “Start over”, which the referee treats as a new game (the game number changes), so nothing from the half-finished setup carries over.
2. **Your turn.** Choose a square on the enemy board that has not been fired on before. A hit and a miss both use up your turn.
3. **The computer's turn.** After a short pause of about 0.6 seconds, the computer fires at one untried square on your board.
4. **Game over.** Play stops as soon as either fleet is sunk. The winner is announced, coins are awarded, and the enemy's remaining ships are shown. “Play again” starts a fresh setup for the next game of the series.

The referee checks every move, including whether it is the right player's turn and whether a square has already been used. The screen also marks unavailable squares so they cannot be chosen by mistake.

## How the computer chooses shots

The computer sees only what a player could know: which squares have been fired on, whether each shot hit or missed, and the locations of ships that have already sunk. It is never given the hidden locations of ships still afloat.

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square.

Once it has hit something, it works through the following checklist, top to bottom, and takes the first step that offers an untried square:

1. **Finish the line.** If two or more hits sit next to each other in a row or column, shoot the square just past one end of that line. It keeps doing this, one square at a time, until the ship sinks or both ends are blocked. If there are several lines, it works on the longest one, and among equally long lines the one it hit most recently.
2. **Look beside a blocked line.** If a line is blocked at both ends by a miss or the board edge, the hits probably belong to two ships lying side by side, so it tries the squares directly alongside the line.
3. **Follow up a lone hit.** For a single hit with no neighbor hit yet, it tries one of the four squares around it—up, down, left, or right—starting with the hit it made most recently.
4. **Anything else nearby.** As a last resort it tries any untried square next to any unfinished hit.

Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets. Earlier versions of the computer measured a line's direction by the distance between its first and last hit, so after three hits in a row it aimed two squares past the end and appeared to "skip a box"; the direction is now always a single step.

Because the computer sees only this public information, it has no advantage from knowing where the unsunk ships are hidden.

## Gold coins and series

Think of the referee as also keeping a small scorecard next to the board. The scorecard has three things on it: the player's gold coin total, the current series (how many games each side has won, and whether the series is decided), and a list of finished series.

- A series is best-of-three: the first side to win two games takes it, so a series lasts two or three games.
- When a game ends, the referee updates the scorecard in the same step that declares the winner. A game won by the player is worth 1 coin. If that win also decides the series, a bonus of 3 coins is added at the same time, and the finished series is added to the list.
- "Play again" keeps the scorecard: if the series is still open, the next game continues it; if the series is decided, a new series starts at 0 – 0.
- Confirming "New game" while a game is in progress is a forfeit: the referee records a game won by the computer (marked as abandoned), pays no coins, and if that decides the series, closes it and opens a new one. "New game" during setup or after a finished game is not a forfeit. The scorecard remembers the forfeited game until the next game starts, so the setup screen and the screen-reader announcement can explain what happened.

The scorecard is part of the game state, so every rule about coins lives in the referee and is covered by the same tests as the rest of the rules. The screen only reads it: the yellow bar at the top shows the coin total and series score on every screen, the result screen explains what was earned, and the hidden announcement for screen readers says the same thing.

Saving is a thin layer outside the referee. Whenever the scorecard changes, the React hook writes it to the browser's session storage under one key, and reads it back when the page loads. Session storage lasts for one browser tab: a refresh keeps the scorecard, closing the tab clears it, the same lifetime as the session leaderboard. Anything that does not look like a valid scorecard (missing, corrupted, or from a different version) is ignored and the player starts from zero. A game in progress is still not saved. Other features, such as a leaderboard, can read the same scorecard from the hook (`rewards`) without touching the referee.

## Why delayed moves are guarded

The pause before the computer fires lets the screen show that it is thinking. That delayed move carries the number of the game and the number of the turn for which it was planned. Think of it as a letter postmarked with both numbers: if the game has restarted or moved on, the referee throws the old letter away instead of applying it.

If the computer's planned shot turns out to be unusable (for example a square that was already fired on, or no square at all), the referee does not ignore it. Instead it fires at the first untried square on your board, so the game never waits forever on "AI is thinking...". In development builds a warning is printed to the browser console when this happens.

When a game resets, the screen leaves the computer's turn, or the screen closes, the waiting move is cancelled. The referee still checks the game and turn numbers when a move arrives, as a second safeguard in case cancellation was too late. In development, a safety check sets up and cleans up the screen's delayed work twice; cancelling the first wait ensures only one computer move is scheduled.

## Terms used in the code

- **Rules engine (referee):** `reducer` — accepts legal moves and updates the game.
- **Game number:** `matchId` — changes when a fresh game starts.
- **Turn number:** `turnId` — advances after each accepted shot.
- **Scorecard:** `Rewards` in `src/game/rewards.ts` — `coins` (total), `series` (`id`, `playerWins`, `aiWins`, `winner`, and `games`, one `GameRecord` per game with `winner`, `forfeit`, `coinsEarned`), `history` (finished series with their games and the coins each earned), and `lastGame` (the game that just ended, used for the announcements).
- **Scorecard rules:** `recordGameResult` (called by the referee when a game ends), `rewardsAfterForfeit` (called when a game in progress is abandoned), and `rewardsForNextGame` (called on “Play again” and on “New game” after a finished game); the amounts are the constants `COINS_PER_GAME_WIN`, `SERIES_WIN_BONUS`, and `SERIES_WINS_NEEDED` in the same file.
- **Saving the scorecard:** `src/hooks/rewardsStorage.ts` — `loadRewards` and `saveRewards`, using the session storage key `sach-battleship.rewards.v1`.
- **Public information shown to the computer:** `AiView` — contains shot results and already-sunk ships, not the hidden fleet.
- **Development safety check:** `Strict Mode` — repeats setup and cleanup to help catch mistakes.
