import { useEffect, useRef, useState } from 'react'
import Board from './Board'
import Legend from './Legend'
import StatusPanel from './StatusPanel'
import {
  abandonWarningMessage,
  describeEnemyCell,
  describePlayerCell,
  rewardMessage,
  seriesResultMessage,
  symbolForCell,
} from '../ui/messages'
import { enemyCellViews, playerCellViews, type GameState } from '../game/state'
import type { Coord } from '../game/types'
import type { GameActions } from '../hooks/useGame'

interface BattleScreenProps {
  state: GameState
  actions: GameActions
}

export default function BattleScreen({ state, actions }: BattleScreenProps) {
  const [confirmingNewGame, setConfirmingNewGame] = useState(false)
  const playAgainRef = useRef<HTMLButtonElement>(null)
  const enemyCells = enemyCellViews(state)
  const gameOver = state.phase === 'gameOver'

  useEffect(() => {
    if (gameOver) playAgainRef.current?.focus()
  }, [gameOver])

  function canFire(coord: Coord): boolean {
    return state.phase === 'playerTurn' && enemyCells[coord.row]?.[coord.col]?.state === 'untried'
  }

  return (
    <section className="battle-screen" aria-labelledby="battle-heading">
      <h1 id="battle-heading">Battleship</h1>
      {gameOver && (
        <div className="game-summary">
          <h2 className="game-result">{state.winner === 'player' ? 'You win!' : 'The AI wins.'}</h2>
          {rewardMessage(state) && <p className="reward-message">{rewardMessage(state)}</p>}
          <p className="series-result">{seriesResultMessage(state)}</p>
        </div>
      )}
      <StatusPanel state={state} />

      {state.phase !== 'gameOver' && (
        <div className="new-game-controls">
          {!confirmingNewGame
            ? <button type="button" onClick={() => setConfirmingNewGame(true)}>New game</button>
            : (
              <div className="confirmation">
                <p>{abandonWarningMessage(state)}</p>
                <button type="button" onClick={() => {
                  setConfirmingNewGame(false)
                  actions.newGame()
                }}>
                  Yes, start over
                </button>
                <button type="button" onClick={() => setConfirmingNewGame(false)}>Keep playing</button>
              </div>
            )}
        </div>
      )}

      <div className="boards-layout">
        <section aria-labelledby="player-board-heading" className="battle-board">
          <h2 id="player-board-heading">Your fleet</h2>
          <Board
            label="Your fleet"
            cells={playerCellViews(state)}
            describeCell={describePlayerCell}
            symbolFor={symbolForCell}
            onActivate={() => undefined}
            canActivate={() => false}
          />
        </section>
        <section aria-labelledby="enemy-board-heading" className="battle-board">
          <h2 id="enemy-board-heading">Enemy waters</h2>
          <Board
            label="Enemy waters"
            cells={enemyCells}
            describeCell={describeEnemyCell}
            symbolFor={symbolForCell}
            onActivate={actions.fire}
            canActivate={canFire}
          />
        </section>
      </div>

      <Legend />
      {gameOver && (
        <button type="button" ref={playAgainRef} onClick={actions.playAgain}>Play again</button>
      )}
    </section>
  )
}
