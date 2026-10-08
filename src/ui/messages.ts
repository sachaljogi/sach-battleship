import { formatCoord } from '../game/coordinates'
import { currentGameNumber, forfeitWouldDecideSeries, gamesPlayed, SERIES_MAX_GAMES } from '../game/rewards'
import { isCompleteValidFleet } from '../game/placement'
import { lastShot } from '../game/state'
import type { GameState, PlacementError, Side } from '../game/state'
import { rankOf, type SessionStats } from '../game/stats'
import type { CellView, PlayerCellView } from '../game/state'
import type { TimerView } from '../hooks/useGame'
import { FLEET, type Coord, type Shot } from '../game/types'

function shipName(id: string | undefined): string | undefined {
  return FLEET.find((ship) => ship.id === id)?.name
}

export const FLEET_COMPLETE_MESSAGE = 'All ships are placed. Press Start game to begin.'

export function placementErrorMessage(error: PlacementError | null): string | null {
  if (!error) return null
  if (error.reason === 'fleet-complete') return FLEET_COMPLETE_MESSAGE
  if (error.reason === 'no-ship-selected') return 'Select a ship before placing it.'
  const selectedShip = shipName(error.shipId)
  if (error.reason === 'already-placed') {
    return `${selectedShip ?? 'That ship'} is already placed and locked. Choose Start over to change your fleet.`
  }
  const where = error.coord ? ` at ${formatCoord(error.coord)}` : ''
  if (error.reason === 'out-of-bounds') return `${selectedShip ?? 'Ship'} would extend off the board${where}.`
  const otherShip = shipName(error.conflictingShipId)
  return otherShip
    ? `${selectedShip ?? 'Ship'} would overlap your ${otherShip}${where}.`
    : `${selectedShip ?? 'Ship'} would overlap another ship${where}.`
}

export function placementSuccessMessage(state: GameState): string | null {
  const placement = state.setup.lastPlacement
  if (!placement) return null
  const placed = `${shipName(placement.shipId) ?? 'Ship'} placed at ${formatCoord(placement.coord)}.`
  const next = shipName(state.setup.selectedShipId ?? undefined)
  return next ? `${placed} Next: ${next}.` : `${placed} ${FLEET_COMPLETE_MESSAGE}`
}

export function setupMessage(state: GameState): string {
  return placementErrorMessage(state.setup.error)
    ?? placementSuccessMessage(state)
    ?? (isCompleteValidFleet(state.setup.ships) ? FLEET_COMPLETE_MESSAGE : 'Set up your fleet.')
}

function playerShotText(shot: Shot | null, autoFired: boolean): string | null {
  if (!shot) return null
  const result = shot.outcome === 'sunk'
    ? `you sank the enemy ${shipName(shot.sunkShipId) ?? 'ship'}`
    : shot.outcome
  return autoFired
    ? `Time ran out, so a shot was fired for you at ${formatCoord(shot.coord)}: ${result}.`
    : `You fired at ${formatCoord(shot.coord)}: ${result}.`
}

function aiShotText(shot: Shot | null): string | null {
  if (!shot) return null
  const result = shot.outcome === 'sunk'
    ? `your ${shipName(shot.sunkShipId) ?? 'ship'} was sunk`
    : shot.outcome
  return `AI fired at ${formatCoord(shot.coord)}: ${result}.`
}

export function latestPlayerShotMessage(state: GameState): string | null {
  return playerShotText(lastShot(state.enemyBoard), state.autoFired)
}

export function latestAiShotMessage(state: GameState): string | null {
  return aiShotText(lastShot(state.playerBoard))
}

export function turnMessage(state: GameState): string {
  if (state.phase === 'playerTurn') return 'Your turn — fire on Enemy waters'
  if (state.phase === 'aiTurn') return 'AI is thinking...'
  if (state.phase === 'gameOver') return state.winner === 'player' ? 'You win!' : 'The AI wins.'
  return 'Set up your fleet.'
}

export function coinsText(count: number): string {
  return `${count} gold coin${count === 1 ? '' : 's'}`
}

export function coinTotalMessage(state: GameState): string {
  return `Gold coins: ${state.rewards.coins}`
}

export function seriesScoreMessage(state: GameState): string {
  const { series } = state.rewards
  const score = `You ${series.playerWins} – AI ${series.aiWins}`
  if (series.winner) {
    return series.winner === 'player'
      ? `Series won ${score}. Play again to start a new series.`
      : `Series lost ${score}. Play again to start a new series.`
  }
  if (state.phase === 'gameOver') {
    return `Series: ${score} after game ${gamesPlayed(series)} of ${SERIES_MAX_GAMES}`
  }
  return `Series: ${score}, game ${currentGameNumber(series)} of ${SERIES_MAX_GAMES}`
}

export function seriesResultMessage(state: GameState): string | null {
  if (state.phase !== 'gameOver') return null
  const { series } = state.rewards
  const score = `${series.playerWins}–${series.aiWins}`
  if (series.winner === 'player') return `You won the best-of-${SERIES_MAX_GAMES} series ${score}!`
  if (series.winner === 'ai') return `The AI won the best-of-${SERIES_MAX_GAMES} series ${score}.`
  return `Series: You ${series.playerWins} – AI ${series.aiWins}. Next up: game ${currentGameNumber(series)} of ${SERIES_MAX_GAMES}.`
}

export function rewardMessage(state: GameState): string | null {
  const { lastGame, coins, series } = state.rewards
  if (state.phase !== 'gameOver' || !lastGame || lastGame.coinsEarned <= 0) return null
  const detail = series.winner === 'player' ? ' (1 for the win plus a series bonus)' : ''
  return `You earned ${coinsText(lastGame.coinsEarned)}${detail}. Total: ${coins}.`
}

export function abandonWarningMessage(state: GameState): string {
  return forfeitWouldDecideSeries(state.rewards)
    ? 'Abandon this game? It counts as a loss, and the AI will win the series.'
    : 'Abandon this game? It counts as a loss in the series.'
}

export function forfeitMessage(state: GameState): string | null {
  const { lastGame, series, history } = state.rewards
  if (state.phase !== 'setup' || !lastGame?.forfeit) return null
  const intro = 'You abandoned the last game, so it counted as a loss.'
  const decided = history.at(-1)
  if (gamesPlayed(series) === 0 && decided) {
    return `${intro} The AI won the best-of-${SERIES_MAX_GAMES} series ${decided.playerWins}–${decided.aiWins}. A new series starts now.`
  }
  return `${intro} Series: You ${series.playerWins} – AI ${series.aiWins}. Next up: game ${currentGameNumber(series)} of ${SERIES_MAX_GAMES}.`
}

export const ANNOUNCE_LAST_SECONDS = 3

export function timerMessage(state: GameState, timer: TimerView): { label: string; value: string } | null {
  if (timer.secondsLeft === null) return null
  if (state.phase === 'playerTurn') {
    return { label: 'Seconds left to fire', value: timer.paused ? 'paused' : String(timer.secondsLeft) }
  }
  if (state.phase === 'aiTurn') {
    return { label: 'AI fires in', value: timer.paused ? 'paused' : String(timer.secondsLeft) }
  }
  return null
}

function countdownAnnouncement(state: GameState, timer?: TimerView): string | null {
  if (!timer || timer.paused || timer.secondsLeft === null || state.phase !== 'playerTurn') return null
  if (timer.secondsLeft > ANNOUNCE_LAST_SECONDS || timer.secondsLeft <= 0) return null
  return timer.secondsLeft === 1 ? '1 second left.' : `${timer.secondsLeft} seconds left.`
}

export function liveMessageForState(state: GameState, timer?: TimerView): string {
  if (state.phase === 'setup') {
    return placementErrorMessage(state.setup.error)
      ?? [forfeitMessage(state), setupMessage(state)].filter(Boolean).join(' ')
  }
  const playerShot = latestPlayerShotMessage(state)
  const aiShot = latestAiShotMessage(state)
  if (state.phase === 'aiTurn') {
    return [playerShot, 'AI is thinking...'].filter(Boolean).join(' ')
  }
  if (state.phase === 'gameOver') {
    const winner = state.winner === 'player' ? 'You win!' : 'The AI wins.'
    return [winner, rewardMessage(state), seriesResultMessage(state), playerShot, aiShot].filter(Boolean).join(' ')
  }
  const countdown = countdownAnnouncement(state, timer)
  return countdown ?? [aiShot, 'Your turn — fire on Enemy waters'].filter(Boolean).join(' ')
}

export function winnerLabel(winner: Side): string {
  return winner === 'player' ? 'You' : 'AI'
}

export function rankUpMessage(stats: SessionStats): string | null {
  const rankUp = stats.lastRankUp
  if (!rankUp || rankUp.game !== stats.gamesPlayed || rankUp.rank !== rankOf(stats)) return null
  return `Promoted to ${rankUp.rank}!`
}

export function rankUpAnnouncement(state: GameState, stats: SessionStats): string | null {
  if (state.phase !== 'gameOver' || stats.lastRecordedMatchId !== state.matchId) return null
  return rankUpMessage(stats)
}

export function describePlayerCell(coord: Coord, cell: PlayerCellView): string {
  const position = `Your fleet, ${formatCoord(coord)}`
  if (cell.state === 'ship') return `${position}, ${cell.shipName ?? 'ship'}`
  if (cell.state === 'hit') return `${position}, ${cell.shipName ?? 'ship'}, hit`
  if (cell.state === 'sunk') return `${position}, ${cell.shipName ?? 'ship'}, sunk`
  if (cell.state === 'miss') return `${position}, miss`
  if (cell.state === 'unhit-ship') return `${position}, unhit ${cell.shipName ?? 'ship'}`
  return `${position}, empty`
}

export function describeEnemyCell(coord: Coord, cell: CellView): string {
  const position = `Enemy waters, ${formatCoord(coord)}`
  if (cell.state === 'untried') return `${position}, untried`
  if (cell.state === 'miss') return `${position}, miss`
  if (cell.state === 'hit') return `${position}, hit`
  if (cell.state === 'sunk') return `${position}, sunk ${cell.shipName ?? 'ship'}`
  return `${position}, unhit ${cell.shipName ?? 'ship'}`
}

export function symbolForCell(cell: CellView | PlayerCellView): string {
  if (cell.state === 'ship') return '■'
  if (cell.state === 'miss') return '•'
  if (cell.state === 'hit') return '✕'
  if (cell.state === 'sunk') return '✖'
  if (cell.state === 'unhit-ship') return '◇'
  return ''
}
