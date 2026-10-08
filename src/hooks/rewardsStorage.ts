import { createInitialRewards, type Rewards, type SeriesRecord, type SeriesState } from '../game/rewards'

export const REWARDS_STORAGE_KEY = 'sach-battleship.rewards.v1'

function isSide(value: unknown): value is 'player' | 'ai' {
  return value === 'player' || value === 'ai'
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isSeries(value: unknown): value is SeriesState {
  if (!value || typeof value !== 'object') return false
  const series = value as Record<string, unknown>
  return isCount(series.id) && isCount(series.playerWins) && isCount(series.aiWins)
    && (series.winner === null || isSide(series.winner))
}

function isRecord(value: unknown): value is SeriesRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isCount(record.id) && isCount(record.playerWins) && isCount(record.aiWins)
    && isSide(record.winner) && isCount(record.coinsEarned)
}

export function parseRewards(raw: string | null): Rewards | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (!isCount(candidate.coins) || !isSeries(candidate.series) || !Array.isArray(candidate.history)
      || !candidate.history.every(isRecord) || !isCount(candidate.lastAward)) return null
    return {
      coins: candidate.coins,
      series: { ...candidate.series },
      history: candidate.history.map((record) => ({ ...record })),
      lastAward: candidate.lastAward,
    }
  } catch {
    return null
  }
}

export function defaultRewardsStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
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
    // Storage may be full or blocked; the in-memory total still works for this visit.
  }
}
