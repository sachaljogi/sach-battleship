import type { Rng } from './game/rng'
import BattleScreen from './components/BattleScreen'
import Leaderboard from './components/Leaderboard'
import SetupScreen from './components/SetupScreen'
import { useGame } from './hooks/useGame'
import { useSessionStats } from './hooks/useSessionStats'
import { liveMessageForState, rankUpAnnouncement } from './ui/messages'

export default function App({ rng }: { rng: Rng }) {
  const { state, ...actions } = useGame(rng)
  const stats = useSessionStats(state)
  const inBattle = state.phase === 'playerTurn' || state.phase === 'aiTurn'
  const rankUp = rankUpAnnouncement(state, stats)

  return (
    <main className="app-shell">
      {state.phase === 'setup'
        ? <SetupScreen state={state} actions={actions} />
        : <BattleScreen state={state} actions={actions} />}
      <Leaderboard stats={stats} rankUp={rankUp} compact={inBattle} />
      <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveMessageForState(state)}
      </p>
      <p aria-live="polite" aria-atomic="true" className="visually-hidden" data-testid="rank-announcement">
        {rankUp}
      </p>
    </main>
  )
}
