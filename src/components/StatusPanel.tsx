import { remainingShipCount } from '../game/state'
import type { GameState } from '../game/state'
import { FLEET } from '../game/types'
import type { TimerView } from '../hooks/useGame'
import { latestAiShotMessage, latestPlayerShotMessage, timerMessage, turnMessage } from '../ui/messages'

export default function StatusPanel({ state, timer }: { state: GameState; timer: TimerView }) {
  const countdown = timerMessage(state, timer)
  return (
    <section className="status-panel" aria-labelledby="status-heading">
      <h2 id="status-heading">Game status</h2>
      <p className="turn-status">{turnMessage(state)}</p>
      {countdown && (
        <p className="move-timer" role="timer" data-urgent={timer.secondsLeft !== null && timer.secondsLeft <= 3}>
          <span className="move-timer-label">{countdown.label}</span>
          <span className="move-timer-count">{countdown.value}</span>
        </p>
      )}
      <p>{latestPlayerShotMessage(state) ?? 'You have not fired yet.'}</p>
      <p>{latestAiShotMessage(state) ?? 'The AI has not fired yet.'}</p>
      <p>Your ships remaining: {remainingShipCount(state.playerBoard)} of {FLEET.length}</p>
      <p>Enemy ships remaining: {remainingShipCount(state.enemyBoard)} of {FLEET.length}</p>
    </section>
  )
}
