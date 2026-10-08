import type { Rng } from './game/rng'
import BattleScreen from './components/BattleScreen'
import SetupScreen from './components/SetupScreen'
import RewardsBar from './components/RewardsBar'
import { useGame } from './hooks/useGame'
import { liveMessageForState } from './ui/messages'

export default function App({ rng }: { rng: Rng }) {
  const { state, ...actions } = useGame(rng)

  return (
    <main className="app-shell">
      <RewardsBar state={state} />
      {state.phase === 'setup'
        ? <SetupScreen state={state} actions={actions} />
        : <BattleScreen state={state} actions={actions} />}
      <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveMessageForState(state)}
      </p>
    </main>
  )
}
