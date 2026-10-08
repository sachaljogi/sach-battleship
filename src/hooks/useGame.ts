import { useEffect, useReducer, useRef, useState } from 'react'
import { chooseAiShot } from '../game/ai'
import { randomFleet } from '../game/placement'
import { createRng, type Rng } from '../game/rng'
import {
  aiViewFromBoard,
  createInitialState,
  firstUntriedCoord,
  gameReducer,
  lastShot,
  scheduledAiTurn,
  scheduledPlayerTurn,
  type GameState,
} from '../game/state'
import type { Coord, ShipId } from '../game/types'

export const MOVE_TIME_MS = 5000
export const AI_MIN_THINK_MS = 1500
export const AI_MAX_THINK_MS = 5000
export const AI_THINK_STEP_MS = 500
export const TIMER_TICK_MS = 1000

export interface GameTimers {
  moveTimeMs: number
  aiMinThinkMs: number
  aiMaxThinkMs: number
  tickMs: number
}

export const DEFAULT_TIMERS: GameTimers = {
  moveTimeMs: MOVE_TIME_MS,
  aiMinThinkMs: AI_MIN_THINK_MS,
  aiMaxThinkMs: AI_MAX_THINK_MS,
  tickMs: TIMER_TICK_MS,
}

export function aiThinkTimeMs(state: GameState, timers: GameTimers = DEFAULT_TIMERS): number {
  const span = Math.max(0, timers.aiMaxThinkMs - timers.aiMinThinkMs)
  const steps = Math.floor(span / AI_THINK_STEP_MS)
  if (steps === 0) return timers.aiMinThinkMs
  const shot = lastShot(state.enemyBoard)
  const seed = state.matchId * 100003 + state.turnId * 101 + (shot ? shot.coord.row * 10 + shot.coord.col : 0)
  return timers.aiMinThinkMs + Math.floor(createRng(seed)() * (steps + 1)) * AI_THINK_STEP_MS
}

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
  setPaused: (paused: boolean) => void
}

export interface TimerView {
  secondsLeft: number | null
  paused: boolean
}

export interface UseGameResult extends GameActions {
  state: GameState
  timer: TimerView
}

interface Elapsed {
  key: string | null
  ms: number
}

export function useGame(rng: Rng, timers: GameTimers = DEFAULT_TIMERS): UseGameResult {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState())
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState<{ key: string; elapsedMs: number } | null>(null)
  const elapsedRef = useRef<Elapsed>({ key: null, ms: 0 })

  const aiTurn = scheduledAiTurn(state)
  const playerTurn = scheduledPlayerTurn(state)
  const side = aiTurn ? 'ai' : playerTurn ? 'player' : null
  const matchId = aiTurn?.matchId ?? playerTurn?.matchId
  const turnId = aiTurn?.turnId ?? playerTurn?.turnId
  const key = side ? `${side}:${matchId}:${turnId}` : null
  const totalMs = side === 'ai' ? aiThinkTimeMs(state, timers) : side === 'player' ? timers.moveTimeMs : 0
  const playerBoard = state.playerBoard
  const enemyBoard = state.enemyBoard

  useEffect(() => {
    if (key === null || side === null || matchId === undefined || turnId === undefined) return
    if (elapsedRef.current.key !== key) elapsedRef.current = { key, ms: 0 }
    if (paused) return
    const remainingMs = Math.max(0, totalMs - elapsedRef.current.ms)
    const timeout = setTimeout(() => {
      if (side === 'ai') {
        const coord = chooseAiShot(aiViewFromBoard(playerBoard), rng)
        dispatch({ type: 'aiFire', coord, matchId, turnId })
      } else {
        const coord = chooseAiShot(aiViewFromBoard(enemyBoard), rng) ?? firstUntriedCoord(enemyBoard)
        if (coord) dispatch({ type: 'playerTimeout', coord, matchId, turnId })
      }
    }, remainingMs)
    const interval = setInterval(() => {
      elapsedRef.current = { key, ms: elapsedRef.current.ms + timers.tickMs }
      setTick({ key, elapsedMs: elapsedRef.current.ms })
    }, timers.tickMs)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [key, side, matchId, turnId, totalMs, paused, playerBoard, enemyBoard, rng, timers])

  const elapsedMs = tick?.key === key ? tick.elapsedMs : 0
  const secondsLeft = key === null ? null : Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000))

  return {
    state,
    timer: { secondsLeft, paused },
    selectShip: (shipId: ShipId) => dispatch({ type: 'selectShip', shipId }),
    rotate: () => dispatch({ type: 'rotate' }),
    placeShip: (coord: Coord) => dispatch({ type: 'placeShip', coord }),
    randomize: () => dispatch({ type: 'randomizeFleet', ships: randomFleet(rng) }),
    clearBoard: () => dispatch({ type: 'clearBoard' }),
    start: () => dispatch({ type: 'startGame', enemyShips: randomFleet(rng) }),
    fire: (coord: Coord) => dispatch({ type: 'playerFire', coord }),
    playAgain: () => {
      setPaused(false)
      dispatch({ type: 'playAgain' })
    },
    newGame: () => {
      setPaused(false)
      dispatch({ type: 'newGame' })
    },
    setPaused,
  }
}
