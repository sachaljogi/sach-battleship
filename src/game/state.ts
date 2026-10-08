import { allCoords, BOARD_SIZE, coordKey, sameCoord } from './coordinates'
import type { AiView } from './ai'
import { isCompleteValidFleet, placeShip, shipCells } from './placement'
import {
  createInitialRewards,
  recordGameResult,
  rewardsAfterForfeit,
  rewardsForNextGame,
  type Rewards,
} from './rewards'
import { fireAt, isFleetSunk, remainingShips, sunkShipIds } from './shots'
import { FLEET, type Board, type Coord, type Orientation, type PlacedShip, type ShipId, type Shot } from './types'

export type Phase = 'setup' | 'playerTurn' | 'aiTurn' | 'gameOver'
export type Side = 'player' | 'ai'

export interface PlacementError {
  reason: 'out-of-bounds' | 'overlap' | 'no-ship-selected' | 'already-placed'
  shipId?: ShipId
  conflictingShipId?: ShipId
  coord?: Coord
}

export interface GameState {
  phase: Phase
  matchId: number
  turnId: number
  setup: {
    ships: PlacedShip[]
    selectedShipId: ShipId | null
    orientation: Orientation
    error: PlacementError | null
  }
  playerBoard: Board
  enemyBoard: Board
  winner: Side | null
  rewards: Rewards
}

export type Action =
  | { type: 'selectShip'; shipId: ShipId }
  | { type: 'rotate' }
  | { type: 'placeShip'; coord: Coord }
  | { type: 'randomizeFleet'; ships: PlacedShip[] }
  | { type: 'clearBoard' }
  | { type: 'startGame'; enemyShips: PlacedShip[] }
  | { type: 'playerFire'; coord: Coord }
  | { type: 'aiFire'; coord: Coord | null; matchId: number; turnId: number }
  | { type: 'playAgain' }
  | { type: 'newGame' }

export interface CellView {
  state: 'untried' | 'miss' | 'hit' | 'sunk' | 'unhit-ship'
  shipName?: string
}

export type PlayerCellView = Omit<CellView, 'state'> & {
  state: CellView['state'] | 'ship'
}

export function createInitialState(matchId = 1, rewards: Rewards = createInitialRewards()): GameState {
  return {
    phase: 'setup',
    matchId,
    turnId: 0,
    setup: {
      ships: [],
      selectedShipId: FLEET[0]!.id,
      orientation: 'horizontal',
      error: null,
    },
    playerBoard: { ships: [], shots: [] },
    enemyBoard: { ships: [], shots: [] },
    winner: null,
    rewards,
  }
}

const clearError = (state: GameState): GameState['setup'] => ({ ...state.setup, error: null })

const isPlaced = (state: GameState, shipId: ShipId): boolean => (
  state.setup.ships.some((ship) => ship.id === shipId)
)

function warnDev(message: string): void {
  if (import.meta.env.DEV) console.warn(`[battleship] ${message}`)
}

export function firstUntriedCoord(board: Board): Coord | null {
  const tried = new Set(board.shots.map((shot) => coordKey(shot.coord)))
  return allCoords(BOARD_SIZE).find((coord) => !tried.has(coordKey(coord))) ?? null
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'selectShip': {
      if (state.phase !== 'setup') return state
      if (isPlaced(state, action.shipId)) {
        return {
          ...state,
          setup: { ...state.setup, error: { reason: 'already-placed', shipId: action.shipId } },
        }
      }
      return { ...state, setup: { ...clearError(state), selectedShipId: action.shipId } }
    }
    case 'rotate': {
      if (state.phase !== 'setup') return state
      return {
        ...state,
        setup: {
          ...clearError(state),
          orientation: state.setup.orientation === 'horizontal' ? 'vertical' : 'horizontal',
        },
      }
    }
    case 'placeShip': {
      if (state.phase !== 'setup') return state
      const shipId = state.setup.selectedShipId
      if (!shipId) {
        return {
          ...state,
          setup: { ...state.setup, error: { reason: 'no-ship-selected', coord: action.coord } },
        }
      }
      if (isPlaced(state, shipId)) {
        return {
          ...state,
          setup: { ...state.setup, error: { reason: 'already-placed', shipId, coord: { ...action.coord } } },
        }
      }
      const result = placeShip(state.setup.ships, {
        id: shipId,
        origin: { ...action.coord },
        orientation: state.setup.orientation,
      })
      if (!result.ok) {
        return {
          ...state,
          setup: {
            ...state.setup,
            error: {
              reason: result.reason,
              shipId,
              ...(result.conflictingShipId ? { conflictingShipId: result.conflictingShipId } : {}),
              coord: { ...action.coord },
            },
          },
        }
      }
      const nextShipId = FLEET.find((spec) => !result.ships.some((ship) => ship.id === spec.id))?.id ?? null
      return {
        ...state,
        setup: { ...clearError(state), ships: result.ships, selectedShipId: nextShipId },
      }
    }
    case 'randomizeFleet': {
      if (state.phase !== 'setup' || state.setup.ships.length > 0 || !isCompleteValidFleet(action.ships)) {
        return state
      }
      return {
        ...state,
        setup: {
          ...clearError(state),
          ships: action.ships.map((ship) => ({ ...ship, origin: { ...ship.origin } })),
          selectedShipId: null,
        },
      }
    }
    case 'clearBoard': {
      if (state.phase !== 'setup' || state.setup.ships.length === 0) return state
      return createInitialState(state.matchId + 1, state.rewards)
    }
    case 'startGame': {
      if (state.phase !== 'setup'
        || !isCompleteValidFleet(state.setup.ships)
        || !isCompleteValidFleet(action.enemyShips)) return state
      const ships = state.setup.ships.map((ship) => ({ ...ship, origin: { ...ship.origin } }))
      return {
        ...state,
        phase: 'playerTurn',
        setup: { ...clearError(state), ships },
        playerBoard: { ships, shots: [] },
        enemyBoard: {
          ships: action.enemyShips.map((ship) => ({ ...ship, origin: { ...ship.origin } })),
          shots: [],
        },
        winner: null,
        rewards: state.rewards.lastGame ? { ...state.rewards, lastGame: null } : state.rewards,
      }
    }
    case 'playerFire': {
      if (state.phase !== 'playerTurn') return state
      const result = fireAt(state.enemyBoard, action.coord)
      if (!result.ok) return state
      const won = isFleetSunk(result.board)
      return {
        ...state,
        turnId: state.turnId + 1,
        phase: won ? 'gameOver' : 'aiTurn',
        enemyBoard: result.board,
        winner: won ? 'player' : null,
        rewards: won ? recordGameResult(state.rewards, 'player') : state.rewards,
      }
    }
    case 'aiFire': {
      if (state.phase !== 'aiTurn' || action.matchId !== state.matchId || action.turnId !== state.turnId) {
        return state
      }
      let result = action.coord ? fireAt(state.playerBoard, action.coord) : null
      if (!result?.ok) {
        const fallback = firstUntriedCoord(state.playerBoard)
        warnDev(`AI shot ${action.coord ? `at ${coordKey(action.coord)}` : 'missing'} was rejected `
          + `(${result ? result.reason : 'no-shot'}); ${fallback ? `firing at ${coordKey(fallback)} instead` : 'no untried cell left, returning the turn'}`)
        result = fallback ? fireAt(state.playerBoard, fallback) : null
      }
      if (!result?.ok) return { ...state, turnId: state.turnId + 1, phase: 'playerTurn' }
      const lost = isFleetSunk(result.board)
      return {
        ...state,
        turnId: state.turnId + 1,
        phase: lost ? 'gameOver' : 'playerTurn',
        playerBoard: result.board,
        winner: lost ? 'ai' : null,
        rewards: lost ? recordGameResult(state.rewards, 'ai') : state.rewards,
      }
    }
    case 'playAgain':
      return state.phase === 'gameOver'
        ? createInitialState(state.matchId + 1, rewardsForNextGame(state.rewards))
        : state
    case 'newGame':
      if (state.phase === 'playerTurn' || state.phase === 'aiTurn') {
        return createInitialState(state.matchId + 1, rewardsAfterForfeit(state.rewards))
      }
      if (state.phase !== 'gameOver') return state
      return createInitialState(state.matchId + 1, rewardsForNextGame(state.rewards))
    default:
      return state
  }
}

export function aiViewFromBoard(board: Board): AiView {
  const sunk = sunkShipIds(board)
  return {
    boardSize: BOARD_SIZE,
    shots: board.shots.map(({ coord, outcome }) => ({ coord: { ...coord }, outcome })),
    sunkShips: sunk.flatMap((id) => {
      const spec = FLEET.find((ship) => ship.id === id)
      const ship = board.ships.find((candidate) => candidate.id === id)
      return spec && ship ? [{ name: spec.name, cells: shipCells(ship) }] : []
    }),
  }
}

export function lastShot(board: Board): Shot | null {
  return board.shots.at(-1) ?? null
}

export function remainingShipCount(board: Board): number {
  return remainingShips(board).length
}

export function scheduledAiTurn(state: GameState): { matchId: number; turnId: number } | null {
  return state.phase === 'aiTurn' ? { matchId: state.matchId, turnId: state.turnId } : null
}

function cellViews(state: GameState, board: Board, revealShips: boolean): CellView[][] {
  const shots = new Map(board.shots.map((shot) => [coordKey(shot.coord), shot]))
  const sunkShipNames = new Map(sunkShipIds(board).flatMap((id) => {
    const ship = board.ships.find((candidate) => candidate.id === id)
    const name = FLEET.find((spec) => spec.id === id)?.name
    return ship && name ? shipCells(ship).map((coord) => [coordKey(coord), name] as const) : []
  }))
  return allCoords(BOARD_SIZE).reduce<CellView[][]>((rows, coord) => {
    const row = rows[coord.row] ?? []
    const shot = shots.get(coordKey(coord))
    const sunkShipName = sunkShipNames.get(coordKey(coord))
    if (shot?.outcome === 'miss') row.push({ state: 'miss' })
    else if (sunkShipName) row.push({ state: 'sunk', shipName: sunkShipName })
    else if (shot) row.push({ state: 'hit' })
    else if (revealShips && state.phase === 'gameOver') {
      const ship = shipAtCell(board, coord)
      const shipName = ship && FLEET.find((spec) => spec.id === ship.id)?.name
      row.push(ship
        ? { state: 'unhit-ship', ...(shipName ? { shipName } : {}) }
        : { state: 'untried' })
    } else row.push({ state: 'untried' })
    rows[coord.row] = row
    return rows
  }, [])
}

function shipAtCell(board: Board, coord: Coord): PlacedShip | undefined {
  return board.ships.find((ship) => shipCells(ship).some((cell) => sameCoord(cell, coord)))
}

export function enemyCellViews(state: GameState): CellView[][] {
  return cellViews(state, state.enemyBoard, true)
}

export function playerCellViews(state: GameState): PlayerCellView[][] {
  const board: Board = state.phase === 'setup'
    ? { ships: state.setup.ships, shots: [] }
    : state.playerBoard
  const base = cellViews(state, board, false)
  return base.map((row, rowIndex) => row.map((cell, colIndex) => {
    const coord = { row: rowIndex, col: colIndex }
    if (cell.state === 'hit' || cell.state === 'sunk') {
      const ship = shipAtCell(board, coord)
      const shipName = ship && FLEET.find((spec) => spec.id === ship.id)?.name
      return { ...cell, ...(shipName ? { shipName } : {}) }
    }
    if (cell.state !== 'untried') return cell
    const ship = shipAtCell(board, coord)
    if (!ship) return cell
    const name = FLEET.find((spec) => spec.id === ship.id)?.name
    return { state: 'ship', ...(name ? { shipName: name } : {}) }
  }))
}
