import { afterEach, describe, expect, it } from 'vitest'
import { createInitialRewards, type Rewards } from '../../game/rewards'
import { loadRewards, parseRewards, REWARDS_STORAGE_KEY, saveRewards } from '../rewardsStorage'

const saved: Rewards = {
  coins: 5,
  series: { id: 2, playerWins: 1, aiWins: 0, winner: null },
  history: [{ id: 1, playerWins: 2, aiWins: 1, winner: 'player', coinsEarned: 5 }],
  lastAward: 0,
}

describe('rewards storage', () => {
  afterEach(() => localStorage.clear())

  it('round-trips rewards through storage', () => {
    saveRewards(localStorage, saved)
    expect(loadRewards(localStorage)).toEqual(saved)
    expect(loadRewards(localStorage)).not.toBe(saved)
  })

  it('falls back to a fresh total when storage is missing, empty, or corrupt', () => {
    expect(loadRewards(null)).toEqual(createInitialRewards())
    expect(loadRewards(localStorage)).toEqual(createInitialRewards())
    localStorage.setItem(REWARDS_STORAGE_KEY, '{not json')
    expect(loadRewards(localStorage)).toEqual(createInitialRewards())
    expect(parseRewards(JSON.stringify({ coins: -1, series: saved.series, history: [], lastAward: 0 }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, series: { ...saved.series, winner: 'nobody' } }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, history: [{ id: 1 }] }))).toBeNull()
  })
})
