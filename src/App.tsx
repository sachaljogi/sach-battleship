import type { Rng } from './game/rng'
import BattleScreen from './components/BattleScreen'
import SetupScreen from './components/SetupScreen'
import { DEFAULT_TIMERS, useGame, type GameTimers } from './hooks/useGame'
import { liveMessageForState } from './ui/messages'

export default function App({ rng, timers = DEFAULT_TIMERS }: { rng: Rng; timers?: GameTimers }) {
  const { state, timer, ...actions } = useGame(rng, timers)

  return (
    <main className="app-shell">
      {state.phase === 'setup'
        ? <SetupScreen state={state} actions={actions} />
        : <BattleScreen state={state} timer={timer} actions={actions} />}
      <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveMessageForState(state, timer)}
      </p>
    </main>
  )
}
