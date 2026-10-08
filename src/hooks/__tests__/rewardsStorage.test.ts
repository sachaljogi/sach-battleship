import { afterEach, describe, expect, it } from 'vitest'
import { createInitialRewards, type Rewards } from '../../game/rewards'
import { loadRewards, parseRewards, REWARDS_STORAGE_KEY, saveRewards } from '../rewardsStorage'

const win = { winner: 'player', forfeit: false, coinsEarned: 1 } as const
const forfeit = { winner: 'ai', forfeit: true, coinsEarned: 0 } as const
const saved: Rewards = {
  coins: 5,
  series: { id: 2, playerWins: 1, aiWins: 0, winner: null, games: [win] },
  history: [{ id: 1, playerWins: 2, aiWins: 1, winner: 'player', coinsEarned: 5, games: [win, forfeit, { ...win, coinsEarned: 4 }] }],
  lastGame: null,
}

describe('rewards storage', () => {
  afterEach(() => sessionStorage.clear())

  it('round-trips rewards through storage', () => {
    saveRewards(sessionStorage, saved)
    expect(loadRewards(sessionStorage)).toEqual(saved)
    expect(loadRewards(sessionStorage)).not.toBe(saved)
    expect(loadRewards(sessionStorage).series.games).not.toBe(saved.series.games)
    expect(localStorage.getItem(REWARDS_STORAGE_KEY)).toBeNull()
  })

  it('falls back to a fresh total when storage is missing, empty, or corrupt', () => {
    expect(loadRewards(null)).toEqual(createInitialRewards())
    expect(loadRewards(sessionStorage)).toEqual(createInitialRewards())
    sessionStorage.setItem(REWARDS_STORAGE_KEY, '{not json')
    expect(loadRewards(sessionStorage)).toEqual(createInitialRewards())
    expect(parseRewards(JSON.stringify({ coins: -1, series: saved.series, history: [], lastGame: null }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, series: { ...saved.series, winner: 'nobody' } }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, series: { ...saved.series, games: [{ winner: 'ai' }] } }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, history: [{ id: 1 }] }))).toBeNull()
    expect(parseRewards(JSON.stringify({ ...saved, lastGame: { winner: 'ai' } }))).toBeNull()
  })
})
