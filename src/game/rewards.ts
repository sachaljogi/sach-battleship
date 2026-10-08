import type { Side } from './state'

export const COINS_PER_GAME_WIN = 1
export const SERIES_WIN_BONUS = 3
export const SERIES_WINS_NEEDED = 2
export const SERIES_MAX_GAMES = SERIES_WINS_NEEDED * 2 - 1

export interface GameRecord {
  winner: Side
  forfeit: boolean
  coinsEarned: number
}

export interface SeriesState {
  id: number
  playerWins: number
  aiWins: number
  winner: Side | null
  games: GameRecord[]
}

export interface SeriesRecord {
  id: number
  playerWins: number
  aiWins: number
  winner: Side
  coinsEarned: number
  games: GameRecord[]
}

export interface Rewards {
  coins: number
  series: SeriesState
  history: SeriesRecord[]
  lastGame: GameRecord | null
}

export function createSeries(id: number): SeriesState {
  return { id, playerWins: 0, aiWins: 0, winner: null, games: [] }
}

export function createInitialRewards(): Rewards {
  return { coins: 0, series: createSeries(1), history: [], lastGame: null }
}

export function gamesPlayed(series: SeriesState): number {
  return series.playerWins + series.aiWins
}

export function currentGameNumber(series: SeriesState): number {
  return Math.min(gamesPlayed(series) + 1, SERIES_MAX_GAMES)
}

export function recordGameResult(rewards: Rewards, winner: Side, forfeit = false): Rewards {
  if (rewards.series.winner) return rewards
  const playerWins = rewards.series.playerWins + (winner === 'player' ? 1 : 0)
  const aiWins = rewards.series.aiWins + (winner === 'ai' ? 1 : 0)
  const seriesWinner: Side | null = playerWins >= SERIES_WINS_NEEDED
    ? 'player'
    : aiWins >= SERIES_WINS_NEEDED ? 'ai' : null
  const award = (winner === 'player' ? COINS_PER_GAME_WIN : 0)
    + (seriesWinner === 'player' ? SERIES_WIN_BONUS : 0)
  const game: GameRecord = { winner, forfeit, coinsEarned: award }
  const series: SeriesState = {
    ...rewards.series,
    playerWins,
    aiWins,
    winner: seriesWinner,
    games: [...rewards.series.games, game],
  }
  return {
    coins: rewards.coins + award,
    series,
    history: seriesWinner
      ? [...rewards.history, {
        id: series.id,
        playerWins,
        aiWins,
        winner: seriesWinner,
        coinsEarned: series.games.reduce((sum, played) => sum + played.coinsEarned, 0),
        games: series.games,
      }]
      : rewards.history,
    lastGame: game,
  }
}

export function rewardsForNextGame(rewards: Rewards): Rewards {
  if (rewards.series.winner) {
    return { ...rewards, series: createSeries(rewards.series.id + 1), lastGame: null }
  }
  return rewards.lastGame === null ? rewards : { ...rewards, lastGame: null }
}

export function rewardsAfterForfeit(rewards: Rewards): Rewards {
  const recorded = recordGameResult(rewards, 'ai', true)
  return { ...rewardsForNextGame(recorded), lastGame: recorded.lastGame }
}

export function forfeitWouldDecideSeries(rewards: Rewards): boolean {
  return rewards.series.aiWins + 1 >= SERIES_WINS_NEEDED
}
