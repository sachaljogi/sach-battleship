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

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square.

Once it has hit something, it works through the following checklist, top to bottom, and takes the first step that offers an untried square:

1. **Finish the line.** If two or more hits sit next to each other in a row or column, shoot the square just past one end of that line. It keeps doing this, one square at a time, until the ship sinks or both ends are blocked. If there are several lines, it works on the longest one, and among equally long lines the one it hit most recently.
2. **Look beside a blocked line.** If a line is blocked at both ends by a miss or the board edge, the hits probably belong to two ships lying side by side, so it tries the squares directly alongside the line.
3. **Follow up a lone hit.** For a single hit with no neighbor hit yet, it tries one of the four squares around it—up, down, left, or right—starting with the hit it made most recently.
4. **Anything else nearby.** As a last resort it tries any untried square next to any unfinished hit.

Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets. Earlier versions of the computer measured a line's direction by the distance between its first and last hit, so after three hits in a row it aimed two squares past the end and appeared to "skip a box"; the direction is now always a single step.

Because the computer sees only this public information, it has no advantage from knowing where the unsunk ships are hidden.

## Why delayed moves are guarded

The pause before the computer fires lets the screen show that it is thinking. That delayed move carries the number of the game and the number of the turn for which it was planned. Think of it as a letter postmarked with both numbers: if the game has restarted or moved on, the referee throws the old letter away instead of applying it.

When a game resets, the screen leaves the computer's turn, or the screen closes, the waiting move is cancelled. The referee still checks the game and turn numbers when a move arrives, as a second safeguard in case cancellation was too late. In development, a safety check sets up and cleans up the screen's delayed work twice; cancelling the first wait ensures only one computer move is scheduled.

## Terms used in the code

- **Rules engine (referee):** `reducer` — accepts legal moves and updates the game.
- **Game number:** `matchId` — changes when a fresh game starts.
- **Turn number:** `turnId` — advances after each accepted shot.
- **Public information shown to the computer:** `AiView` — contains shot results and already-sunk ships, not the hidden fleet.
- **Development safety check:** `Strict Mode` — repeats setup and cleanup to help catch mistakes.
