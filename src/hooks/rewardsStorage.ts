import { createInitialRewards, type GameRecord, type Rewards, type SeriesRecord, type SeriesState } from '../game/rewards'

export const REWARDS_STORAGE_KEY = 'sach-battleship.rewards.v1'

function isSide(value: unknown): value is 'player' | 'ai' {
  return value === 'player' || value === 'ai'
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isGame(value: unknown): value is GameRecord {
  if (!value || typeof value !== 'object') return false
  const game = value as Record<string, unknown>
  return isSide(game.winner) && typeof game.forfeit === 'boolean' && isCount(game.coinsEarned)
}

function isGameList(value: unknown): value is GameRecord[] {
  return Array.isArray(value) && value.every(isGame)
}

function isSeries(value: unknown): value is SeriesState {
  if (!value || typeof value !== 'object') return false
  const series = value as Record<string, unknown>
  return isCount(series.id) && isCount(series.playerWins) && isCount(series.aiWins)
    && (series.winner === null || isSide(series.winner)) && isGameList(series.games)
}

function isRecord(value: unknown): value is SeriesRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isCount(record.id) && isCount(record.playerWins) && isCount(record.aiWins)
    && isSide(record.winner) && isCount(record.coinsEarned) && isGameList(record.games)
}

export function parseRewards(raw: string | null): Rewards | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (!isCount(candidate.coins) || !isSeries(candidate.series) || !Array.isArray(candidate.history)
      || !candidate.history.every(isRecord)
      || !(candidate.lastGame === null || isGame(candidate.lastGame))) return null
    return {
      coins: candidate.coins,
      series: { ...candidate.series, games: candidate.series.games.map((game) => ({ ...game })) },
      history: candidate.history.map((record) => ({ ...record, games: record.games.map((game) => ({ ...game })) })),
      lastGame: candidate.lastGame ? { ...candidate.lastGame } : null,
    }
  } catch {
    return null
  }
}

export function defaultRewardsStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function loadRewards(storage: Storage | null): Rewards {
  if (!storage) return createInitialRewards()
  try {
    return parseRewards(storage.getItem(REWARDS_STORAGE_KEY)) ?? createInitialRewards()
  } catch {
    return createInitialRewards()
  }
}

export function saveRewards(storage: Storage | null, rewards: Rewards): void {
  if (!storage) return
  try {
    storage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(rewards))
  } catch {
    // Storage may be full or blocked; the in-memory total still works for this tab.
  }
}
