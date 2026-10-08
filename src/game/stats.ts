import type { GameState, Side } from './state'

export type Rank = 'Recruit' | 'Ensign' | 'Captain' | 'Admiral'

/** Ranks are awarded by total wins in the session; the highest threshold reached applies. */
export const RANK_THRESHOLDS: readonly { rank: Rank; wins: number }[] = [
  { rank: 'Recruit', wins: 0 },
  { rank: 'Ensign', wins: 1 },
  { rank: 'Captain', wins: 3 },
  { rank: 'Admiral', wins: 6 },
]

export const RECENT_GAMES_SHOWN = 5

export interface GameResult {
  matchId: number
  winner: Side
  playerShots: number
  aiShots: number
}

export interface GameRecord extends GameResult {
  game: number
}

export interface SessionStats {
  gamesPlayed: number
  wins: number
  losses: number
  streak: number
  bestWinShots: number | null
  lastRecordedMatchId: number | null
  lastRankUp: { game: number; rank: Rank } | null
  games: GameRecord[]
}

export function createInitialStats(): SessionStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestWinShots: null,
    lastRecordedMatchId: null,
    lastRankUp: null,
    games: [],
  }
}

export function rankForWins(wins: number): Rank {
  return RANK_THRESHOLDS.reduce<Rank>((current, threshold) => (
    wins >= threshold.wins ? threshold.rank : current
  ), RANK_THRESHOLDS[0]!.rank)
}

export function rankOf(stats: SessionStats): Rank {
  return rankForWins(stats.wins)
}

export function nextRank(stats: SessionStats): { rank: Rank; winsNeeded: number } | null {
  const next = RANK_THRESHOLDS.find((threshold) => threshold.wins > stats.wins)
  return next ? { rank: next.rank, winsNeeded: next.wins - stats.wins } : null
}

export function winRate(stats: SessionStats): number {
  return stats.gamesPlayed === 0 ? 0 : stats.wins / stats.gamesPlayed
}

export function recordGame(stats: SessionStats, result: GameResult): SessionStats {
  if (stats.lastRecordedMatchId === result.matchId) return stats
  const won = result.winner === 'player'
  const wins = stats.wins + (won ? 1 : 0)
  const game = stats.gamesPlayed + 1
  const previousRank = rankOf(stats)
  const rank = rankForWins(wins)
  const bestWinShots = won
    ? Math.min(stats.bestWinShots ?? Number.POSITIVE_INFINITY, result.playerShots)
    : stats.bestWinShots
  return {
    gamesPlayed: game,
    wins,
    losses: stats.losses + (won ? 0 : 1),
    streak: won ? stats.streak + 1 : 0,
    bestWinShots,
    lastRecordedMatchId: result.matchId,
    lastRankUp: rank !== previousRank ? { game, rank } : stats.lastRankUp,
    games: [...stats.games, { ...result, game }],
  }
}

export function recentGames(stats: SessionStats, count = RECENT_GAMES_SHOWN): GameRecord[] {
  return stats.games.slice(-count).reverse()
}

export function finishedGameResult(state: GameState): GameResult | null {
  if (state.phase !== 'gameOver' || !state.winner) return null
  return {
    matchId: state.matchId,
    winner: state.winner,
    playerShots: state.enemyBoard.shots.length,
    aiShots: state.playerBoard.shots.length,
  }
}

const RANKS = new Set<string>(RANK_THRESHOLDS.map((threshold) => threshold.rank))

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isGameRecord(value: unknown): value is GameRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isCount(record.game)
    && isCount(record.matchId)
    && (record.winner === 'player' || record.winner === 'ai')
    && isCount(record.playerShots)
    && isCount(record.aiShots)
}

/** Rebuilds stats from untrusted JSON (for example sessionStorage); returns null when the shape is wrong. */
export function parseStats(raw: unknown): SessionStats | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const rankUp = data.lastRankUp as Record<string, unknown> | null | undefined
  if (!isCount(data.gamesPlayed) || !isCount(data.wins) || !isCount(data.losses) || !isCount(data.streak)) return null
  if (data.bestWinShots !== null && !isCount(data.bestWinShots)) return null
  if (!Array.isArray(data.games) || !data.games.every(isGameRecord)) return null
  if (rankUp != null && (typeof rankUp !== 'object' || !isCount(rankUp.game) || !RANKS.has(String(rankUp.rank)))) {
    return null
  }
  return {
    gamesPlayed: data.gamesPlayed,
    wins: data.wins,
    losses: data.losses,
    streak: data.streak,
    bestWinShots: data.bestWinShots as number | null,
    lastRecordedMatchId: null,
    lastRankUp: rankUp ? { game: rankUp.game as number, rank: rankUp.rank as Rank } : null,
    games: data.games,
  }
}
