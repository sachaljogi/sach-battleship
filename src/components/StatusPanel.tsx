import { remainingShipCount } from '../game/state'
import type { GameState } from '../game/state'
import { FLEET } from '../game/types'
import { latestAiShotMessage, latestPlayerShotMessage, turnMessage } from '../ui/messages'

export default function StatusPanel({ state }: { state: GameState }) {
  return (
    <section className="status-panel" aria-labelledby="status-heading">
      <h2 id="status-heading">Game status</h2>
      <p className="turn-status">{turnMessage(state)}</p>
      <p>{latestPlayerShotMessage(state) ?? 'You have not fired yet.'}</p>
      <p>{latestAiShotMessage(state) ?? 'The AI has not fired yet.'}</p>
      <p>Your ships remaining: {remainingShipCount(state.playerBoard)} of {FLEET.length}</p>
      <p>Enemy ships remaining: {remainingShipCount(state.enemyBoard)} of {FLEET.length}</p>
    </section>
  )
}
