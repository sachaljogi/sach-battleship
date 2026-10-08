import { describe, expect, it } from 'vitest'
import {
  createInitialStats,
  finishedGameResult,
  nextRank,
  parseStats,
  RANK_THRESHOLDS,
  rankForWins,
  rankOf,
  recentGames,
  recordGame,
  winRate,
  type GameResult,
  type SessionStats,
} from '../stats'
import { freezeDeep, startGame } from './helpers'

function win(matchId: number, playerShots = 40): GameResult {
  return { matchId, winner: 'player', playerShots, aiShots: playerShots - 1 }
}

function loss(matchId: number): GameResult {
  return { matchId, winner: 'ai', playerShots: 50, aiShots: 51 }
}

function play(results: GameResult[], initial = createInitialStats()): SessionStats {
  return results.reduce((stats, result) => recordGame(freezeDeep(stats), result), initial)
}

describe('session stats', () => {
  it('starts empty at the lowest rank', () => {
    const stats = createInitialStats()
    expect(stats).toMatchObject({ gamesPlayed: 0, wins: 0, losses: 0, streak: 0, bestWinShots: null, games: [] })
    expect(rankOf(stats)).toBe('Recruit')
    expect(winRate(stats)).toBe(0)
    expect(nextRank(stats)).toEqual({ rank: 'Ensign', winsNeeded: 1 })
  })

  it('awards ranks at the documented win thresholds', () => {
    expect(RANK_THRESHOLDS.map((threshold) => threshold.rank)).toEqual(['Recruit', 'Ensign', 'Captain', 'Admiral'])
    expect(rankForWins(0)).toBe('Recruit')
    expect(rankForWins(1)).toBe('Ensign')
    expect(rankForWins(2)).toBe('Ensign')
    expect(rankForWins(3)).toBe('Captain')
    expect(rankForWins(5)).toBe('Captain')
    expect(rankForWins(6)).toBe('Admiral')
    expect(rankForWins(100)).toBe('Admiral')
    expect(nextRank({ ...createInitialStats(), wins: 6 })).toBeNull()
  })

  it('counts wins and losses, and resets the streak after a loss', () => {
    const stats = play([win(1), win(2), loss(3), win(4)])
    expect(stats.gamesPlayed).toBe(4)
    expect(stats.wins).toBe(3)
    expect(stats.losses).toBe(1)
    expect(stats.streak).toBe(1)
    expect(winRate(stats)).toBe(0.75)
    expect(play([win(1), win(2), loss(3)]).streak).toBe(0)
  })

  it('keeps the fewest-shots win as the best win and ignores losses', () => {
    expect(play([loss(1)]).bestWinShots).toBeNull()
    const stats = play([win(1, 45), loss(2), win(3, 30), win(4, 38)])
    expect(stats.bestWinShots).toBe(30)
  })

  it('records a rank-up on the game that crosses a threshold and remembers it', () => {
    const first = play([win(1)])
    expect(first.lastRankUp).toEqual({ game: 1, rank: 'Ensign' })
    const second = recordGame(first, win(2))
    expect(second.lastRankUp).toEqual({ game: 1, rank: 'Ensign' })
    const third = recordGame(second, win(3))
    expect(third.lastRankUp).toEqual({ game: 3, rank: 'Captain' })
  })

  it('records each match only once even if asked twice', () => {
    const once = play([win(1)])
    const twice = recordGame(once, win(1))
    expect(twice).toBe(once)
    expect(twice.gamesPlayed).toBe(1)
    const next = recordGame(twice, loss(2))
    expect(next.gamesPlayed).toBe(2)
  })

  it('lists the most recent games newest first with game numbers', () => {
    const stats = play([win(1), loss(2), win(3), win(4), loss(5), win(6), win(7)])
    const recent = recentGames(stats)
    expect(recent.map((game) => game.game)).toEqual([7, 6, 5, 4, 3])
    expect(recent[0]).toEqual({ game: 7, matchId: 7, winner: 'player', playerShots: 40, aiShots: 39 })
    expect(recentGames(stats, 2).map((game) => game.game)).toEqual([7, 6])
  })

  it('derives a result from a finished game and nothing from a running one', () => {
    const running = startGame()
    expect(finishedGameResult(running)).toBeNull()
    const finished = {
      ...running,
      phase: 'gameOver' as const,
      winner: 'player' as const,
      enemyBoard: { ...running.enemyBoard, shots: [{ coord: { row: 0, col: 0 }, outcome: 'miss' as const }] },
    }
    expect(finishedGameResult(finished)).toEqual({
      matchId: running.matchId,
      winner: 'player',
      playerShots: 1,
      aiShots: 0,
    })
  })

  it('restores saved stats and rejects malformed data', () => {
    const stats = play([win(1, 33), loss(2)])
    const restored = parseStats(JSON.parse(JSON.stringify(stats)))
    expect(restored).toEqual({ ...stats, lastRecordedMatchId: null })
    expect(parseStats(null)).toBeNull()
    expect(parseStats({ wins: 'many' })).toBeNull()
    expect(parseStats({ ...stats, games: [{ game: 1 }] })).toBeNull()
    expect(parseStats({ ...stats, lastRankUp: { game: 1, rank: 'Pirate' } })).toBeNull()
  })
})
