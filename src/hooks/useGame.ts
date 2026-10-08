import { useEffect, useReducer } from 'react'
import { chooseAiShot } from '../game/ai'
import { randomFleet } from '../game/placement'
import type { Rewards } from '../game/rewards'
import type { Rng } from '../game/rng'
import {
  aiViewFromBoard,
  createInitialState,
  gameReducer,
  scheduledAiTurn,
  type GameState,
} from '../game/state'
import type { Coord, ShipId } from '../game/types'
import { defaultRewardsStorage, loadRewards, saveRewards } from './rewardsStorage'

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
  rewards: Rewards
}

export interface UseGameOptions {
  storage?: Storage | null
}

export function useGame(rng: Rng, options: UseGameOptions = {}): UseGameResult {
  const storage = options.storage === undefined ? defaultRewardsStorage() : options.storage
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState(1, loadRewards(storage)))
  const rewards = state.rewards
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

  useEffect(() => {
    saveRewards(storage, rewards)
  }, [storage, rewards])

  return {
    state,
    rewards,
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
