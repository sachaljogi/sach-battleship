import { describe, expect, it } from 'vitest'
import { randomFleet } from '../game/placement'
import { createRng } from '../game/rng'
import { gameReducer, createInitialState } from '../game/state'
import type { Rewards } from '../game/rewards'
import { createInitialStats, recordGame } from '../game/stats'
import {
  abandonWarningMessage,
  coinTotalMessage,
  describeEnemyCell,
  describePlayerCell,
  forfeitMessage,
  liveMessageForState,
  placementErrorMessage,
  placementSuccessMessage,
  rankUpAnnouncement,
  rankUpMessage,
  rewardMessage,
  seriesResultMessage,
  seriesScoreMessage,
  timerMessage,
  winnerLabel,
} from './messages'

type SeriesOverride = Partial<Omit<Rewards, 'series'>> & { series?: Partial<Rewards['series']> }

function rewards(overrides: SeriesOverride = {}): Rewards {
  return {
    coins: 0,
    history: [],
    lastGame: null,
    ...overrides,
    series: { id: 1, playerWins: 0, aiWins: 0, winner: null, games: [], ...overrides.series },
  }
}

describe('UI messages', () => {
  it('describes placement errors without duplicating reducer state', () => {
    expect(placementErrorMessage({ reason: 'out-of-bounds', shipId: 'carrier' }))
      .toBe('Carrier would extend off the board.')
    expect(placementErrorMessage({ reason: 'out-of-bounds', shipId: 'carrier', coord: { row: 0, col: 9 } }))
      .toBe('Carrier would extend off the board at J1.')
    expect(placementErrorMessage({
      reason: 'overlap',
      shipId: 'battleship',
      conflictingShipId: 'carrier',
      coord: { row: 0, col: 0 },
    })).toBe('Battleship would overlap your Carrier at A1.')
    expect(placementErrorMessage({ reason: 'fleet-complete', coord: { row: 0, col: 0 } }))
      .toBe('All ships are placed. Press Start game to begin.')
    expect(placementErrorMessage({ reason: 'no-ship-selected' })).toBe('Select a ship before placing it.')
    expect(placementErrorMessage({ reason: 'already-placed', shipId: 'carrier' }))
      .toBe('Carrier is already placed and locked. Choose Start over to change your fleet.')

    const placed = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 0, col: 0 } })
    const locked = gameReducer(placed, { type: 'selectShip', shipId: 'carrier' })
    expect(liveMessageForState(locked))
      .toBe('Carrier is already placed and locked. Choose Start over to change your fleet.')

    const error = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 9, col: 9 } })
    expect(liveMessageForState(error)).toBe('Carrier would extend off the board at J10.')
    const repeated = gameReducer(error, { type: 'placeShip', coord: { row: 9, col: 8 } })
    expect(liveMessageForState(repeated)).toBe('Carrier would extend off the board at I10.')
  })

  it('announces successful placements and the completed fleet during setup', () => {
    const placed = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(liveMessageForState(placed)).toBe('Carrier placed at A1. Next: Battleship.')
    expect(placementSuccessMessage(placed)).toBe('Carrier placed at A1. Next: Battleship.')

    const rotated = gameReducer(placed, { type: 'rotate' })
    expect(liveMessageForState(rotated)).toBe('Set up your fleet.')

    let state = placed
    for (const row of [1, 2, 3]) {
      state = gameReducer(state, { type: 'placeShip', coord: { row, col: 0 } })
    }
    state = gameReducer(state, { type: 'placeShip', coord: { row: 4, col: 0 } })
    expect(liveMessageForState(state))
      .toBe('Destroyer placed at A5. All ships are placed. Press Start game to begin.')

    const randomized = gameReducer(createInitialState(), { type: 'randomizeFleet', ships: randomFleet(createRng(3)) })
    expect(liveMessageForState(randomized)).toBe('All ships are placed. Press Start game to begin.')
    const clicked = gameReducer(randomized, { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(liveMessageForState(clicked)).toBe('All ships are placed. Press Start game to begin.')
  })

  it('describes player and enemy cells using only their public views', () => {
    expect(describeEnemyCell({ row: 6, col: 2 }, { state: 'untried' }))
      .toBe('Grey Wolf, C7, untried')
    expect(describeEnemyCell({ row: 6, col: 2 }, { state: 'hit' }))
      .toBe('Grey Wolf, C7, hit')
    expect(describeEnemyCell({ row: 6, col: 2 }, { state: 'sunk', shipName: 'Cruiser' }))
      .toBe('Grey Wolf, C7, sunk Cruiser')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'ship', shipName: 'Carrier' }))
      .toBe('Greyhound, A1, Carrier')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'hit', shipName: 'Carrier' }))
      .toBe('Greyhound, A1, Carrier, hit')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'untried' }))
      .toBe('Greyhound, A1, empty')
  })

  it('announces the current phase and winner from reducer state', () => {
    expect(liveMessageForState(createInitialState())).toBe('Set up your fleet.')
    const rng = createRng(4)
    const setup = gameReducer(createInitialState(), {
      type: 'randomizeFleet',
      ships: randomFleet(rng),
    })
    const playerTurn = gameReducer(setup, {
      type: 'startGame',
      enemyShips: randomFleet(rng),
    })
    expect(liveMessageForState(playerTurn)).toBe('Your turn — fire on Grey Wolf')

    const aiTurn = gameReducer(playerTurn, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(liveMessageForState(aiTurn)).toContain('AI is thinking...')
    expect(liveMessageForState(aiTurn)).toContain('You fired at A1:')

    const gameOver = { ...playerTurn, phase: 'gameOver' as const, winner: 'player' as const }
    expect(liveMessageForState(gameOver)).toContain('You win!')
  })

  it('shows the coin total and series score during setup and play', () => {
    const setup = createInitialState()
    expect(coinTotalMessage(setup)).toBe('Gold coins: 0')
    expect(seriesScoreMessage(setup)).toBe('Series: You 0 – AI 0, game 1 of 3')
    expect(liveMessageForState(setup)).toBe('Set up your fleet.')

    const midSeries = {
      ...setup,
      rewards: rewards({ coins: 1, series: { playerWins: 1, aiWins: 1 } }),
    }
    expect(coinTotalMessage(midSeries)).toBe('Gold coins: 1')
    expect(seriesScoreMessage(midSeries)).toBe('Series: You 1 – AI 1, game 3 of 3')
  })

  it('announces coin gains and series results at game over', () => {
    const base = createInitialState()
    const gameWon = {
      ...base,
      phase: 'gameOver' as const,
      winner: 'player' as const,
      rewards: rewards({
        coins: 1,
        lastGame: { winner: 'player', forfeit: false, coinsEarned: 1 },
        series: { playerWins: 1 },
      }),
    }
    expect(rewardMessage(gameWon)).toBe('You earned 1 gold coin. Total: 1.')
    expect(seriesScoreMessage(gameWon)).toBe('Series: You 1 – AI 0 after game 1 of 3')
    expect(seriesResultMessage(gameWon)).toBe('Series: You 1 – AI 0. Next up: game 2 of 3.')
    expect(liveMessageForState(gameWon))
      .toBe('You win! You earned 1 gold coin. Total: 1. Series: You 1 – AI 0. Next up: game 2 of 3.')

    const seriesWon = {
      ...gameWon,
      rewards: rewards({
        coins: 5,
        lastGame: { winner: 'player', forfeit: false, coinsEarned: 4 },
        series: { playerWins: 2, winner: 'player' },
      }),
    }
    expect(rewardMessage(seriesWon)).toBe('You earned 4 gold coins (1 for the win plus a series bonus). Total: 5.')
    expect(seriesResultMessage(seriesWon)).toBe('You won the best-of-3 series 2–0!')
    expect(seriesScoreMessage(seriesWon)).toBe('Series won You 2 – AI 0. Play again to start a new series.')
    expect(liveMessageForState(seriesWon)).toContain('You won the best-of-3 series 2–0!')

    const seriesLost = {
      ...base,
      phase: 'gameOver' as const,
      winner: 'ai' as const,
      rewards: rewards({
        coins: 1,
        lastGame: { winner: 'ai', forfeit: false, coinsEarned: 0 },
        series: { playerWins: 1, aiWins: 2, winner: 'ai' },
      }),
    }
    expect(rewardMessage(seriesLost)).toBeNull()
    expect(seriesResultMessage(seriesLost)).toBe('The AI won the best-of-3 series 1–2.')
    expect(liveMessageForState(seriesLost)).toBe('The AI wins. The AI won the best-of-3 series 1–2.')
    expect(liveMessageForState(seriesLost)).not.toContain('earned')
  })

  it('warns before abandoning a game and announces a forfeit during setup', () => {
    const playing = { ...createInitialState(), phase: 'playerTurn' as const }
    expect(abandonWarningMessage(playing)).toBe('Abandon this game? It counts as a loss in the series.')
    expect(abandonWarningMessage({ ...playing, rewards: rewards({ series: { aiWins: 1 } }) }))
      .toBe('Abandon this game? It counts as a loss, and the AI will win the series.')

    const forfeit = { winner: 'ai', forfeit: true, coinsEarned: 0 } as const
    const afterForfeit = {
      ...createInitialState(),
      rewards: rewards({ lastGame: forfeit, series: { playerWins: 1, aiWins: 1, games: [forfeit] } }),
    }
    expect(forfeitMessage(afterForfeit))
      .toBe('You abandoned the last game, so it counted as a loss. Series: You 1 – AI 1. Next up: game 3 of 3.')
    expect(liveMessageForState(afterForfeit)).toBe(`${forfeitMessage(afterForfeit)} Set up your fleet.`)

    const seriesDecided = {
      ...createInitialState(),
      rewards: rewards({
        lastGame: forfeit,
        series: { id: 2 },
        history: [{ id: 1, playerWins: 0, aiWins: 2, winner: 'ai', coinsEarned: 0, games: [forfeit, forfeit] }],
      }),
    }
    expect(forfeitMessage(seriesDecided)).toBe(
      'You abandoned the last game, so it counted as a loss. The AI won the best-of-3 series 0–2. A new series starts now.',
    )
    expect(forfeitMessage({ ...afterForfeit, phase: 'playerTurn' })).toBeNull()
    expect(forfeitMessage(createInitialState())).toBeNull()
  })

  it('shows the countdown and announces only the last few seconds of the player turn', () => {
    const rng = createRng(5)
    const setup = gameReducer(createInitialState(), { type: 'randomizeFleet', ships: randomFleet(rng) })
    const playerTurn = gameReducer(setup, { type: 'startGame', enemyShips: randomFleet(rng) })

    expect(timerMessage(playerTurn, { secondsLeft: 5, paused: false }))
      .toEqual({ label: 'Seconds left to fire', value: '5' })
    expect(timerMessage(playerTurn, { secondsLeft: 2, paused: true }))
      .toEqual({ label: 'Seconds left to fire', value: 'paused' })
    expect(timerMessage(playerTurn, { secondsLeft: null, paused: false })).toBeNull()
    expect(timerMessage(createInitialState(), { secondsLeft: 5, paused: false })).toBeNull()

    expect(liveMessageForState(playerTurn, { secondsLeft: 5, paused: false }))
      .toBe('Your turn — fire on Grey Wolf')
    expect(liveMessageForState(playerTurn, { secondsLeft: 4, paused: false }))
      .toBe('Your turn — fire on Grey Wolf')
    expect(liveMessageForState(playerTurn, { secondsLeft: 3, paused: false })).toBe('3 seconds left.')
    expect(liveMessageForState(playerTurn, { secondsLeft: 1, paused: false })).toBe('1 second left.')
    expect(liveMessageForState(playerTurn, { secondsLeft: 2, paused: true }))
      .toBe('Your turn — fire on Grey Wolf')

    const timedOut = gameReducer(playerTurn, {
      type: 'playerTimeout',
      coord: { row: 0, col: 0 },
      matchId: playerTurn.matchId,
      turnId: playerTurn.turnId,
    })
    expect(timerMessage(timedOut, { secondsLeft: 3, paused: false })).toEqual({ label: 'AI fires in', value: '3' })
    expect(liveMessageForState(timedOut, { secondsLeft: 3, paused: false }))
      .toContain('Time ran out, so a shot was fired for you at A1:')
    expect(liveMessageForState(timedOut, { secondsLeft: 3, paused: false })).toContain('AI is thinking...')
  })

  it('announces a promotion only for the game that earned it', () => {
    const first = recordGame(createInitialStats(), { matchId: 1, winner: 'player', playerShots: 40, aiShots: 30 })
    expect(rankUpMessage(createInitialStats())).toBeNull()
    expect(rankUpMessage(first)).toBe('Promoted to Ensign!')
    const second = recordGame(first, { matchId: 2, winner: 'player', playerShots: 40, aiShots: 30 })
    expect(rankUpMessage(second)).toBeNull()
    const lost = recordGame(first, { matchId: 2, winner: 'ai', playerShots: 40, aiShots: 30 })
    expect(rankUpMessage(lost)).toBeNull()

    const gameOver = { ...createInitialState(1), phase: 'gameOver' as const, winner: 'player' as const }
    expect(rankUpAnnouncement(gameOver, first)).toBe('Promoted to Ensign!')
    expect(rankUpAnnouncement(createInitialState(2), first)).toBeNull()
    expect(rankUpAnnouncement({ ...gameOver, matchId: 2 }, first)).toBeNull()
    expect(winnerLabel('player')).toBe('You')
    expect(winnerLabel('ai')).toBe('AI')
  })
})
