import { useEffect, useReducer } from 'react'
import type { GameState } from '../game/state'
import {
  createInitialStats,
  finishedGameResult,
  parseStats,
  recordGame,
  type GameResult,
  type SessionStats,
} from '../game/stats'

export const STATS_STORAGE_KEY = 'sach-battleship:session-stats'

function loadStats(): SessionStats {
  try {
    const raw = window.sessionStorage.getItem(STATS_STORAGE_KEY)
    return (raw && parseStats(JSON.parse(raw))) || createInitialStats()
  } catch {
    return createInitialStats()
  }
}

function saveStats(stats: SessionStats): void {
  try {
    window.sessionStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // Storage may be unavailable (private mode, quota); the in-memory stats still work.
  }
}

function statsReducer(stats: SessionStats, result: GameResult): SessionStats {
  return recordGame(stats, result)
}

/** Records each finished game exactly once (guarded by matchId) and keeps the stats in sessionStorage. */
export function useSessionStats(state: GameState): SessionStats {
  const [stats, record] = useReducer(statsReducer, undefined, loadStats)
  const result = finishedGameResult(state)
  const matchId = result?.matchId
  const winner = result?.winner
  const playerShots = result?.playerShots
  const aiShots = result?.aiShots

  useEffect(() => {
    if (matchId === undefined || winner === undefined || playerShots === undefined || aiShots === undefined) return
    record({ matchId, winner, playerShots, aiShots })
  }, [matchId, winner, playerShots, aiShots])

  useEffect(() => {
    saveStats(stats)
  }, [stats])

  return stats
}
