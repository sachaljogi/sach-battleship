# How the game works

The game is a small React application backed by a deterministic game engine. The engine stores the current phase, both boards, the selected setup information, and the latest shot history. React renders that state and sends player actions to the reducer; it does not keep a second copy of the game rules.

## The four phases

1. **Setup** — the player places each ship manually or asks the game to place a valid fleet. A game cannot start until all five ships are placed.
2. **Player turn** — the player chooses an untried cell on the enemy board. A hit and a miss both use up the turn.
3. **AI turn** — the game waits 600 milliseconds, then the AI fires at one untried cell on the player's board.
4. **Game over** — play stops as soon as one fleet is sunk. The winner is announced and the enemy's remaining ships are revealed. “Play again” starts a clean setup.

The reducer rejects moves that are not legal in the current phase, including repeat shots. The UI also marks unavailable enemy cells as non-activatable, but the reducer remains the final authority.

## How the AI chooses a shot

The AI receives an `AiView` made from public information: shot coordinates and outcomes, plus the positions of ships that have already sunk. It never receives the hidden locations of unsunk ships.

When there is no unresolved hit, the AI hunts on untried checkerboard cells to avoid spending shots between the rows and columns of the smallest ship. If no checkerboard cells remain, it uses any untried cell. After a hit, it first tries to extend a line when multiple hits align; otherwise it probes untried orthogonal neighbors. Sunk ship cells are removed from the unresolved-hit set, while hits on other ships remain targets.

Because the AI uses only this public view, two hidden fleets that have produced the same public shot history present the same information to the AI.

## Delayed turns and stale timers

The React hook schedules the AI's response with a 600ms timeout only during the AI phase. The timeout is cancelled if the effect is cleaned up, including when the component unmounts or the match leaves that phase.

Cancellation is backed by reducer checks. Every match has a `matchId`, and accepted shots advance a `turnId`; a scheduled AI action carries both values. If an old timer fires after a reset or a later turn, the reducer rejects it rather than applying a stale shot. Resetting starts a new match ID. This also makes React Strict Mode's development-only effect cleanup and re-run safe: the first timer is cleared before the replacement is scheduled.
