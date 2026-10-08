import { useEffect, useReducer } from 'react'
import { chooseAiShot } from '../game/ai'
import { randomFleet } from '../game/placement'
import type { Rng } from '../game/rng'
import {
  aiViewFromBoard,
  createInitialState,
  gameReducer,
  scheduledAiTurn,
  type GameState,
} from '../game/state'
import type { Coord, ShipId } from '../game/types'

export const AI_DELAY_MS = 600

export interface GameActions {
  selectShip: (shipId: ShipId) => void
  rotate: () => void
  placeShip: (coord: Coord) => void
  randomize: () => void
  clearBoard: () => void
  start: () => void
  fire: (coord: Coord) => void
  playAgain: () => void
  newGame: () => void
}

export interface UseGameResult extends GameActions {
  state: GameState
}

export function useGame(rng: Rng): UseGameResult {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState())
  const scheduled = scheduledAiTurn(state)
  const matchId = scheduled?.matchId
  const turnId = scheduled?.turnId
  const playerBoard = state.playerBoard

  useEffect(() => {
    if (matchId === undefined || turnId === undefined) return
    const timer = setTimeout(() => {
      const coord = chooseAiShot(aiViewFromBoard(playerBoard), rng)
      dispatch({ type: 'aiFire', coord, matchId, turnId })
    }, AI_DELAY_MS)
    return () => clearTimeout(timer)
  }, [matchId, turnId, playerBoard, rng])

  return {
    state,
    selectShip: (shipId: ShipId) => dispatch({ type: 'selectShip', shipId }),
    rotate: () => dispatch({ type: 'rotate' }),
    placeShip: (coord: Coord) => dispatch({ type: 'placeShip', coord }),
    randomize: () => dispatch({ type: 'randomizeFleet', ships: randomFleet(rng) }),
    clearBoard: () => dispatch({ type: 'clearBoard' }),
    start: () => dispatch({ type: 'startGame', enemyShips: randomFleet(rng) }),
    fire: (coord: Coord) => dispatch({ type: 'playerFire', coord }),
    playAgain: () => dispatch({ type: 'playAgain' }),
    newGame: () => dispatch({ type: 'newGame' }),
  }
}
