import type { GameState } from '../game/state'
import { coinTotalMessage, seriesScoreMessage } from '../ui/messages'

export default function RewardsBar({ state }: { state: GameState }) {
  return (
    <header className="rewards-bar" aria-label="Rewards">
      <p className="coin-total" data-testid="coin-total">
        <span className="coin-icon" aria-hidden="true" />
        {coinTotalMessage(state)}
      </p>
      <p className="series-score" data-testid="series-score">{seriesScoreMessage(state)}</p>
    </header>
  )
}
