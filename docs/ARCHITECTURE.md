# How the game works

Behind the screen, a rules engine—the referee—decides which moves are allowed and what happens next. The screen shows the referee's decisions, so the game rules are not duplicated in several places.

## The four parts of a game

1. **Set up the fleet.** Place all five ships yourself or let the game arrange them. Play cannot start until every ship is placed. After every placement the referee remembers which ship went where, so the screen (and a screen reader) can confirm it, such as "Carrier placed at A1. Next: Battleship." Once the fleet is complete the board no longer takes clicks, and the message reads "All ships are placed. Press Start game to begin." If a click still reaches the referee at that point, it answers with that same message instead of asking you to select a ship.
2. **Your turn.** Choose a square on the enemy board that has not been fired on before. A hit and a miss both use up your turn.
3. **The computer's turn.** After a short pause of about 0.6 seconds, the computer fires at one untried square on your board.
4. **Game over.** Play stops as soon as either fleet is sunk. The winner is announced and the enemy's remaining ships are shown. “Play again” starts a fresh setup.

The referee checks every move, including whether it is the right player's turn and whether a square has already been used. The screen also marks unavailable squares so they cannot be chosen by mistake.

## How messages reach screen readers

A hidden "status" line on the page is read aloud by screen readers whenever its text changes. Its text is worked out from the referee's current state, never typed in by the screen. Because only *changes* are read out, every message must differ from the one before it: placement problems name the square ("Carrier would extend off the board at J1."), and successful placements are announced too, rather than falling back to the generic "Set up your fleet."

## How the computer chooses shots

The computer sees only what a player could know: which squares have been fired on, whether each shot hit or missed, and the locations of ships that have already sunk. It is never given the hidden locations of ships still afloat.

When it has no hit to follow up, it searches untried squares in an alternating pattern, like the squares on a checkerboard. If none of those squares remain, it can choose any untried square. After a hit, it checks the four neighboring squares—up, down, left, and right. If several hits line up, it tries the open ends of that line. Squares belonging to a sunk ship are no longer treated as an unfinished target, but hits on other ships remain targets.

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
- **Last placed ship:** `setup.lastPlacement` — which ship was just placed and where, used for the confirmation message.
- **Fleet complete reason:** `fleet-complete` — the referee's answer when a placement is attempted after every ship is already placed.
- **Status line text:** `liveMessageForState` — turns the referee's state into the sentence screen readers hear.
