# How the game works

Behind the screen, a rules engine—the referee—decides which moves are allowed and what happens next. The screen shows the referee's decisions, so the game rules are not duplicated in several places.

## The four parts of a game

1. **Set up the fleet.** Place all five ships yourself or let the game arrange them. Play cannot start until every ship is placed.
2. **Your turn.** Choose a square on the enemy board that has not been fired on before. A hit and a miss both use up your turn. You have 5 seconds: a countdown next to "Your turn" shows the seconds left, and the last three seconds are also read out for screen-reader users. If the clock reaches zero, the game chooses a square for you using the same search method the computer uses (an untried square, following up any earlier hits), fires it, and the status line says that time ran out. Opening the "New game" confirmation pauses the clock; "Keep playing" resumes it with the same number of seconds remaining.
3. **The computer's turn.** The computer "thinks" for between 1.5 and 5 seconds, and the same countdown shows when its shot will land. The exact pause is fixed for each turn (it is worked out from the game number, turn number and your last shot), so the same game always replays the same way. Then it fires at one untried square on your board.
4. **Game over.** Play stops as soon as either fleet is sunk. The winner is announced and the enemy's remaining ships are shown. “Play again” starts a fresh setup.

The referee checks every move, including whether it is the right player's turn and whether a square has already been used. The screen also marks unavailable squares so they cannot be chosen by mistake.

## How the computer chooses shots

The computer sees only what a player could know: which squares have been fired on, whether each shot hit or missed, and the locations of ships that have already sunk. It is never given the hidden locations of ships still afloat.

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square. After a hit, it checks the four neighboring squares—up, down, left, and right. If several hits line up, it tries the open ends of that line. Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets.

Because the computer sees only this public information, it has no advantage from knowing where the unsunk ships are hidden.

## Why delayed moves are guarded

The referee never looks at a clock. All timing—the 5-second player clock, the computer's thinking pause and the once-a-second countdown—lives in the screen layer (`useGame`). When time runs out, the screen sends the referee a normal move: either the computer's shot or an automatic shot on the player's behalf. Each such delayed move carries the number of the game and the number of the turn for which it was planned. Think of it as a letter postmarked with both numbers: if the game has restarted or moved on, the referee throws the old letter away instead of applying it.

When a game resets, the turn changes, the clock is paused, or the screen closes, the waiting move and its countdown are cancelled. The referee still checks the game and turn numbers when a move arrives, as a second safeguard in case cancellation was too late. In development, a safety check sets up and cleans up the screen's delayed work twice; cancelling the first wait ensures only one computer move is scheduled.

## Terms used in the code

- **Rules engine (referee):** `reducer` — accepts legal moves and updates the game.
- **Game number:** `matchId` — changes when a fresh game starts.
- **Turn number:** `turnId` — advances after each accepted shot.
- **Automatic shot when time runs out:** `playerTimeout` — a move the screen sends for the player; the referee accepts it only if it matches the current game and turn. `autoFired` records that the last player shot was automatic so the status line can say so.
- **Move clock settings:** `GameTimers` — the 5-second move limit (`moveTimeMs`), the computer's shortest and longest pause (`aiMinThinkMs`, `aiMaxThinkMs`) and how often the countdown updates (`tickMs`). Tests pass shorter settings instead of waiting for real seconds.
- **Public information shown to the computer:** `AiView` — contains shot results and already-sunk ships, not the hidden fleet.
- **Development safety check:** `Strict Mode` — repeats setup and cleanup to help catch mistakes.
