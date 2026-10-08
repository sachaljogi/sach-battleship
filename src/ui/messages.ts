import { formatCoord } from '../game/coordinates'
import { isCompleteValidFleet } from '../game/placement'
import { lastShot } from '../game/state'
import type { GameState, PlacementError, Side } from '../game/state'
import { rankOf, type SessionStats } from '../game/stats'
import type { CellView, PlayerCellView } from '../game/state'
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

function playerShotText(shot: Shot | null): string | null {
  if (!shot) return null
  const result = shot.outcome === 'sunk'
    ? `you sank the enemy ${shipName(shot.sunkShipId) ?? 'ship'}`
    : shot.outcome
  return `You fired at ${formatCoord(shot.coord)}: ${result}.`
}

function aiShotText(shot: Shot | null): string | null {
  if (!shot) return null
  const result = shot.outcome === 'sunk'
    ? `your ${shipName(shot.sunkShipId) ?? 'ship'} was sunk`
    : shot.outcome
  return `AI fired at ${formatCoord(shot.coord)}: ${result}.`
}

export function latestPlayerShotMessage(state: GameState): string | null {
  return playerShotText(lastShot(state.enemyBoard))
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

export function liveMessageForState(state: GameState): string {
  if (state.phase === 'setup') return setupMessage(state)
  const playerShot = latestPlayerShotMessage(state)
  const aiShot = latestAiShotMessage(state)
  if (state.phase === 'aiTurn') {
    return [playerShot, 'AI is thinking...'].filter(Boolean).join(' ')
  }
  if (state.phase === 'gameOver') {
    const winner = state.winner === 'player' ? 'You win!' : 'The AI wins.'
    return [winner, playerShot, aiShot].filter(Boolean).join(' ')
  }
  return [aiShot, 'Your turn — fire on Enemy waters'].filter(Boolean).join(' ')
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
