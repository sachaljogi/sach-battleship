import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCoords, coordKey, BOARD_SIZE } from '../coordinates'
import { chooseAiShot } from '../ai'
import { createRng, pick } from '../rng'
import { isCompleteValidFleet, shipCells } from '../placement'
import { FLEET } from '../types'
import {
  aiViewFromBoard,
  createInitialState,
  enemyCellViews,
  firstUntriedCoord,
  gameReducer,
  lastShot,
  playerCellViews,
  remainingShipCount,
  scheduledAiTurn,
  type GameState,
} from '../state'
import { isFleetSunk } from '../shots'
import type { Board, Coord } from '../types'
import { COINS_PER_GAME_WIN, SERIES_WIN_BONUS, createInitialRewards, rewardsAfterForfeit } from '../rewards'
import { fleet, fleetCells, freezeDeep, startGame } from './helpers'

function winningPlayerTurn(state: GameState): { state: GameState; finalCoord: Coord } {
  const cells = fleetCells(state.enemyBoard.ships)
  const finalCoord = cells.at(-1)!
  const board: Board = {
    ships: state.enemyBoard.ships,
    shots: cells.slice(0, -1).map((coord) => ({ coord, outcome: 'hit' })),
  }
  expect(isFleetSunk(board)).toBe(false)
  return { state: { ...state, phase: 'playerTurn', enemyBoard: board }, finalCoord }
}

function losingAiTurn(state: GameState): { state: GameState; finalCoord: Coord } {
  const cells = fleetCells(state.playerBoard.ships)
  const finalCoord = cells.at(-1)!
  const board: Board = {
    ships: state.playerBoard.ships,
    shots: cells.slice(0, -1).map((coord) => ({ coord, outcome: 'hit' })),
  }
  return { state: { ...state, phase: 'aiTurn', playerBoard: board }, finalCoord }
}

function finishGame(state: GameState, winner: 'player' | 'ai'): GameState {
  const playing = startGame(fleet(10), fleet(20))
  const base: GameState = { ...playing, matchId: state.matchId, rewards: state.rewards }
  if (winner === 'player') {
    const prepared = winningPlayerTurn(base)
    return gameReducer(prepared.state, { type: 'playerFire', coord: prepared.finalCoord })
  }
  const prepared = losingAiTurn(base)
  return gameReducer(prepared.state, {
    type: 'aiFire',
    coord: prepared.finalCoord,
    matchId: prepared.state.matchId,
    turnId: prepared.state.turnId,
  })
}

function playSeries(results: readonly ('player' | 'ai')[]): GameState {
  return results.reduce<GameState>((state, winner) => {
    const next = state.phase === 'gameOver' ? gameReducer(state, { type: 'playAgain' }) : state
    return finishGame(next, winner)
  }, createInitialState())
}

describe('gold coins and best-of-3 series', () => {
  it('starts with no coins and a fresh series', () => {
    expect(createInitialState().rewards).toEqual(createInitialRewards())
    expect(createInitialState().rewards.series).toEqual({ id: 1, playerWins: 0, aiWins: 0, winner: null, games: [] })
  })

  it('awards one coin per game won and keeps the series open at 1-0', () => {
    const won = playSeries(['player'])
    expect(won.phase).toBe('gameOver')
    expect(won.winner).toBe('player')
    expect(won.rewards.coins).toBe(COINS_PER_GAME_WIN)
    expect(won.rewards.lastGame).toEqual({ winner: 'player', forfeit: false, coinsEarned: COINS_PER_GAME_WIN })
    expect(won.rewards.series).toEqual({
      id: 1,
      playerWins: 1,
      aiWins: 0,
      winner: null,
      games: [{ winner: 'player', forfeit: false, coinsEarned: COINS_PER_GAME_WIN }],
    })
    expect(won.rewards.history).toEqual([])
  })

  it('awards no coins for a lost game but records the AI win', () => {
    const lost = playSeries(['ai'])
    expect(lost.winner).toBe('ai')
    expect(lost.rewards.coins).toBe(0)
    expect(lost.rewards.lastGame).toEqual({ winner: 'ai', forfeit: false, coinsEarned: 0 })
    expect(lost.rewards.series).toMatchObject({ id: 1, playerWins: 0, aiWins: 1, winner: null })
  })

  it('wins the series 2-0 with a bonus and records it in history', () => {
    const state = playSeries(['player', 'player'])
    expect(state.rewards.series).toMatchObject({ id: 1, playerWins: 2, aiWins: 0, winner: 'player' })
    expect(state.rewards.lastGame?.coinsEarned).toBe(COINS_PER_GAME_WIN + SERIES_WIN_BONUS)
    expect(state.rewards.coins).toBe(2 * COINS_PER_GAME_WIN + SERIES_WIN_BONUS)
    expect(state.rewards.history).toEqual([{
      id: 1,
      playerWins: 2,
      aiWins: 0,
      winner: 'player',
      coinsEarned: 2 * COINS_PER_GAME_WIN + SERIES_WIN_BONUS,
      games: [
        { winner: 'player', forfeit: false, coinsEarned: COINS_PER_GAME_WIN },
        { winner: 'player', forfeit: false, coinsEarned: COINS_PER_GAME_WIN + SERIES_WIN_BONUS },
      ],
    }])
  })

  it('wins the series 2-1 after dropping a game', () => {
    const state = playSeries(['player', 'ai', 'player'])
    expect(state.rewards.series).toMatchObject({ id: 1, playerWins: 2, aiWins: 1, winner: 'player' })
    expect(state.rewards.coins).toBe(2 * COINS_PER_GAME_WIN + SERIES_WIN_BONUS)
    expect(state.rewards.history[0]?.coinsEarned).toBe(2 * COINS_PER_GAME_WIN + SERIES_WIN_BONUS)
  })

  it('loses the series 1-2, keeps coins already earned, and pays no bonus', () => {
    const state = playSeries(['ai', 'player', 'ai'])
    expect(state.rewards.series).toMatchObject({ id: 1, playerWins: 1, aiWins: 2, winner: 'ai' })
    expect(state.rewards.coins).toBe(COINS_PER_GAME_WIN)
    expect(state.rewards.lastGame).toEqual({ winner: 'ai', forfeit: false, coinsEarned: 0 })
    expect(state.rewards.history).toMatchObject([
      { id: 1, playerWins: 1, aiWins: 2, winner: 'ai', coinsEarned: COINS_PER_GAME_WIN },
    ])
  })

  it('continues an open series on playAgain and starts a new one after it is decided', () => {
    const open = gameReducer(playSeries(['player']), { type: 'playAgain' })
    expect(open.phase).toBe('setup')
    expect(open.rewards.series).toMatchObject({ id: 1, playerWins: 1, aiWins: 0, winner: null })
    expect(open.rewards.lastGame).toBeNull()

    const decided = playSeries(['ai', 'ai'])
    const fresh = gameReducer(decided, { type: 'playAgain' })
    expect(fresh.rewards.series).toEqual({ id: 2, playerWins: 0, aiWins: 0, winner: null, games: [] })
    expect(fresh.rewards.coins).toBe(decided.rewards.coins)
    expect(fresh.rewards.history).toEqual(decided.rewards.history)

    const secondSeries = finishGame(fresh, 'player')
    expect(secondSeries.rewards.series).toMatchObject({ id: 2, playerWins: 1, aiWins: 0, winner: null })
  })

  it('counts a game abandoned mid-match as a series loss without paying coins', () => {
    const open = gameReducer(playSeries(['player']), { type: 'playAgain' })
    const playing = gameReducer(
      gameReducer(open, { type: 'randomizeFleet', ships: fleet(3) }),
      { type: 'startGame', enemyShips: fleet(4) },
    )
    const forfeit = { winner: 'ai', forfeit: true, coinsEarned: 0 } as const

    const abandonedOnPlayerTurn = gameReducer(playing, { type: 'newGame' })
    expect(abandonedOnPlayerTurn.phase).toBe('setup')
    expect(abandonedOnPlayerTurn.rewards.coins).toBe(playing.rewards.coins)
    expect(abandonedOnPlayerTurn.rewards.series).toMatchObject({ id: 1, playerWins: 1, aiWins: 1, winner: null })
    expect(abandonedOnPlayerTurn.rewards.series.games.at(-1)).toEqual(forfeit)
    expect(abandonedOnPlayerTurn.rewards.lastGame).toEqual(forfeit)
    expect(abandonedOnPlayerTurn.rewards.history).toEqual([])

    const aiTurn = gameReducer(playing, { type: 'playerFire', coord: { row: 0, col: 0 } })
    const abandonedOnAiTurn = gameReducer(aiTurn, { type: 'newGame' })
    expect(abandonedOnAiTurn.rewards).toEqual(abandonedOnPlayerTurn.rewards)
    expect(scheduledAiTurn(abandonedOnAiTurn)).toBeNull()

    const started = gameReducer(
      gameReducer(abandonedOnPlayerTurn, { type: 'randomizeFleet', ships: fleet(5) }),
      { type: 'startGame', enemyShips: fleet(6) },
    )
    expect(started.rewards.lastGame).toBeNull()
  })

  it('lets a forfeit decide the series and starts a new series straight away', () => {
    const oneDown = gameReducer(playSeries(['ai']), { type: 'playAgain' })
    const playing = gameReducer(
      gameReducer(oneDown, { type: 'randomizeFleet', ships: fleet(3) }),
      { type: 'startGame', enemyShips: fleet(4) },
    )
    const abandoned = gameReducer(playing, { type: 'newGame' })
    expect(abandoned.rewards.series).toEqual({ id: 2, playerWins: 0, aiWins: 0, winner: null, games: [] })
    expect(abandoned.rewards.history).toEqual([{
      id: 1,
      playerWins: 0,
      aiWins: 2,
      winner: 'ai',
      coinsEarned: 0,
      games: [
        { winner: 'ai', forfeit: false, coinsEarned: 0 },
        { winner: 'ai', forfeit: true, coinsEarned: 0 },
      ],
    }])
    expect(abandoned.rewards.lastGame).toEqual({ winner: 'ai', forfeit: true, coinsEarned: 0 })
    expect(abandoned.rewards.coins).toBe(0)
  })

  it('does not count newGame as a loss during setup or after game over', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'newGame' })).toBe(setup)
    const won = playSeries(['player'])
    const afterGameOver = gameReducer(won, { type: 'newGame' })
    expect(afterGameOver.rewards).toEqual(gameReducer(won, { type: 'playAgain' }).rewards)
    expect(afterGameOver.rewards.series).toMatchObject({ playerWins: 1, aiWins: 0 })
    expect(afterGameOver.rewards.lastGame).toBeNull()
  })
})

describe('game reducer', () => {
  it('flows setup to playerTurn, aiTurn, and back to playerTurn', () => {
    const state = startGame()
    expect(state.phase).toBe('playerTurn')
    expect(scheduledAiTurn(state)).toBeNull()
    expect(remainingShipCount(state.enemyBoard)).toBe(5)
    const player = gameReducer(state, { type: 'playerFire', coord: { row: 9, col: 9 } })
    expect(player.phase).toBe('aiTurn')
    expect(lastShot(player.enemyBoard)?.coord).toEqual({ row: 9, col: 9 })
    expect(scheduledAiTurn(player)).toEqual({ matchId: player.matchId, turnId: 1 })
    const ai = gameReducer(player, {
      type: 'aiFire',
      coord: { row: 9, col: 9 },
      matchId: player.matchId,
      turnId: player.turnId,
    })
    expect(ai.phase).toBe('playerTurn')
    expect(lastShot(ai.playerBoard)?.coord).toEqual({ row: 9, col: 9 })
    expect(ai.turnId).toBe(2)
  })

  it('rejects actions in the wrong phase and stale AI turns by identity', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'playerFire', coord: { row: 0, col: 0 } })).toBe(setup)
    const playing = startGame()
    const duringPlayerTurn = { type: 'aiFire', coord: { row: 0, col: 0 }, matchId: playing.matchId, turnId: 0 } as const
    expect(gameReducer(playing, duringPlayerTurn)).toBe(playing)
    const aiTurn = gameReducer(playing, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(gameReducer(aiTurn, { type: 'playerFire', coord: { row: 0, col: 1 } })).toBe(aiTurn)
    expect(gameReducer(aiTurn, {
      type: 'aiFire',
      coord: { row: 0, col: 0 },
      matchId: aiTurn.matchId + 1,
      turnId: aiTurn.turnId,
    })).toBe(aiTurn)
    expect(gameReducer(aiTurn, {
      type: 'aiFire',
      coord: { row: 0, col: 0 },
      matchId: aiTurn.matchId,
      turnId: aiTurn.turnId + 1,
    })).toBe(aiTurn)
  })

  it('requires complete valid player and enemy fleets before starting', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'startGame', enemyShips: fleet(1) })).toBe(setup)
    const full = fleet(2)
    const invalid = full.slice(1)
    expect(gameReducer(setup, { type: 'randomizeFleet', ships: invalid })).toBe(setup)
    const ready = gameReducer(setup, { type: 'randomizeFleet', ships: full })
    expect(gameReducer(ready, { type: 'startGame', enemyShips: invalid })).toBe(ready)
    expect(isCompleteValidFleet(ready.setup.ships)).toBe(true)
  })

  it('does not grant another turn for a hit', () => {
    const state = startGame(fleet(1), fleet(2))
    const target = shipCells(state.enemyBoard.ships[0]!)[0]!
    const next = gameReducer(state, { type: 'playerFire', coord: target })
    expect(lastShot(next.enemyBoard)?.outcome).toBe('hit')
    expect(next.phase).toBe('aiTurn')
  })

  it('rejects repeated and out-of-bounds player shots by reference', () => {
    const initial = startGame()
    const coordinate = { row: 0, col: 0 }
    const fired = gameReducer(initial, { type: 'playerFire', coord: coordinate })
    const returned = gameReducer(fired, {
      type: 'aiFire',
      coord: { row: 9, col: 9 },
      matchId: fired.matchId,
      turnId: fired.turnId,
    })
    expect(returned.phase).toBe('playerTurn')
    expect(gameReducer(returned, { type: 'playerFire', coord: coordinate })).toBe(returned)
    expect(gameReducer(returned, { type: 'playerFire', coord: { row: 10, col: 0 } })).toBe(returned)
  })

  describe('rejected AI shots never leave the game in aiTurn', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    function aiTurnWithRepeat(): GameState {
      const started = startGame()
      const first = gameReducer(started, { type: 'playerFire', coord: { row: 5, col: 5 } })
      const replied = gameReducer(first, { type: 'aiFire', coord: { row: 0, col: 0 }, matchId: first.matchId, turnId: first.turnId })
      expect(replied.phase).toBe('playerTurn')
      return gameReducer(replied, { type: 'playerFire', coord: { row: 5, col: 6 } })
    }

    it.each([
      ['a repeated cell', { row: 0, col: 0 }, 'repeat'],
      ['an out-of-bounds cell', { row: 10, col: 0 }, 'out-of-bounds'],
      ['a missing shot', null, 'no-shot'],
    ])('fires at the first untried cell instead of %s', (_label, coord, reason) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const aiTurn = aiTurnWithRepeat()
      expect(aiTurn.phase).toBe('aiTurn')
      const fallback = firstUntriedCoord(aiTurn.playerBoard)
      expect(fallback).toEqual({ row: 0, col: 1 })
      const next = gameReducer(aiTurn, { type: 'aiFire', coord, matchId: aiTurn.matchId, turnId: aiTurn.turnId })
      expect(next).not.toBe(aiTurn)
      expect(next.phase).toBe('playerTurn')
      expect(next.turnId).toBe(aiTurn.turnId + 1)
      expect(next.playerBoard.shots).toHaveLength(2)
      expect(lastShot(next.playerBoard)?.coord).toEqual(fallback)
      expect(scheduledAiTurn(next)).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain(reason)
    })

    it('is deterministic and leaves its inputs untouched', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const aiTurn = freezeDeep(aiTurnWithRepeat())
      const action = { type: 'aiFire', coord: { row: 0, col: 0 }, matchId: aiTurn.matchId, turnId: aiTurn.turnId } as const
      expect(gameReducer(aiTurn, action)).toEqual(gameReducer(aiTurn, action))
    })

    it('still ignores stale AI shots without firing a fallback', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const aiTurn = aiTurnWithRepeat()
      expect(gameReducer(aiTurn, { type: 'aiFire', coord: null, matchId: aiTurn.matchId, turnId: aiTurn.turnId + 1 }))
        .toBe(aiTurn)
      expect(warn).not.toHaveBeenCalled()
    })

    it('returns the turn to the player when no untried cell remains', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const aiTurn = aiTurnWithRepeat()
      const fullBoard: Board = {
        ships: aiTurn.playerBoard.ships,
        shots: allCoords().map((coord) => ({ coord, outcome: 'miss' as const })),
      }
      const exhausted: GameState = { ...aiTurn, playerBoard: fullBoard }
      expect(firstUntriedCoord(fullBoard)).toBeNull()
      const next = gameReducer(exhausted, { type: 'aiFire', coord: null, matchId: aiTurn.matchId, turnId: aiTurn.turnId })
      expect(next.phase).toBe('playerTurn')
      expect(next.turnId).toBe(aiTurn.turnId + 1)
      expect(next.playerBoard).toBe(fullBoard)
    })
  })

  it('ends immediately on the winning player shot without scheduling an AI turn', () => {
    const prepared = winningPlayerTurn(startGame())
    const won = gameReducer(prepared.state, { type: 'playerFire', coord: prepared.finalCoord })
    expect(won.phase).toBe('gameOver')
    expect(won.winner).toBe('player')
    expect(lastShot(won.enemyBoard)?.outcome).toBe('sunk')
    expect(scheduledAiTurn(won)).toBeNull()
    expect(gameReducer(won, { type: 'aiFire', coord: { row: 0, col: 0 }, matchId: won.matchId, turnId: won.turnId }))
      .toBe(won)
    expect(gameReducer(won, { type: 'playerFire', coord: { row: 0, col: 0 } })).toBe(won)
  })

  it('sets a placement error without changing the placed ships', () => {
    const placed = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 0, col: 0 } })
    const ships = placed.setup.ships
    const setup = gameReducer(placed, { type: 'placeShip', coord: { row: 9, col: 9 } })
    expect(setup.setup.error).toEqual({
      reason: 'out-of-bounds',
      shipId: 'battleship',
      coord: { row: 9, col: 9 },
    })
    expect(setup.setup.ships).toHaveLength(1)
    expect(setup.setup.ships).toBe(ships)
  })

  it('clears setup errors on success and locks placed ships against re-placement', () => {
    let state = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 9, col: 9 } })
    state = gameReducer(state, { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(state.setup.error).toBeNull()
    expect(state.setup.ships).toHaveLength(1)
    expect(state.setup.selectedShipId).toBe('battleship')

    const selectLocked = gameReducer(state, { type: 'selectShip', shipId: 'carrier' })
    expect(selectLocked.setup.error).toEqual({ reason: 'already-placed', shipId: 'carrier' })
    expect(selectLocked.setup.selectedShipId).toBe('battleship')
    expect(selectLocked.setup.ships).toBe(state.setup.ships)

    const forced: GameState = { ...state, setup: { ...state.setup, selectedShipId: 'carrier' } }
    const rePlaced = gameReducer(forced, { type: 'placeShip', coord: { row: 2, col: 0 } })
    expect(rePlaced.setup.error).toEqual({ reason: 'already-placed', shipId: 'carrier', coord: { row: 2, col: 0 } })
    expect(rePlaced.setup.ships).toBe(forced.setup.ships)
    expect(rePlaced.setup.ships[0]?.origin).toEqual({ row: 0, col: 0 })
  })

  it('allows randomize only on an empty board and makes Start over a new game', () => {
    const empty = createInitialState()
    expect(gameReducer(empty, { type: 'clearBoard' })).toBe(empty)
    const randomized = gameReducer(empty, { type: 'randomizeFleet', ships: fleet(8) })
    expect(isCompleteValidFleet(randomized.setup.ships)).toBe(true)
    expect(randomized.setup.error).toBeNull()
    expect(gameReducer(randomized, { type: 'randomizeFleet', ships: fleet(9) })).toBe(randomized)

    const placed = gameReducer(empty, { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(gameReducer(placed, { type: 'randomizeFleet', ships: fleet(8) })).toBe(placed)

    const restarted = gameReducer(placed, { type: 'clearBoard' })
    expect(restarted).toEqual(createInitialState(placed.matchId + 1))
    expect(restarted.setup.ships).toEqual([])
    expect(restarted.setup.error).toBeNull()

    const rewarded = { ...placed, rewards: { ...placed.rewards, coins: 4 } }
    const restartedWithRewards = gameReducer(rewarded, { type: 'clearBoard' })
    expect(restartedWithRewards.rewards).toBe(rewarded.rewards)
    expect(restartedWithRewards.setup.ships).toEqual([])
  })

  it('allows newGame during a match but rejects it during setup', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'newGame' })).toBe(setup)

    const playing = startGame()
    const duringPlayerTurn = gameReducer(playing, { type: 'newGame' })
    expect(duringPlayerTurn).toEqual(createInitialState(playing.matchId + 1, rewardsAfterForfeit(playing.rewards)))

    const aiTurn = gameReducer(playing, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(gameReducer(aiTurn, { type: 'newGame' }))
      .toEqual(createInitialState(aiTurn.matchId + 1, rewardsAfterForfeit(aiTurn.rewards)))

    const prepared = winningPlayerTurn(playing)
    const gameOver = gameReducer(prepared.state, { type: 'playerFire', coord: prepared.finalCoord })
    expect(gameOver.phase).toBe('gameOver')
    expect(gameReducer(gameOver, { type: 'newGame' })).toEqual(createInitialState(gameOver.matchId + 1, { ...gameOver.rewards, lastGame: null }))
  })

  it('restricts playAgain to gameOver and returns a clean setup state', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'playAgain' })).toBe(setup)

    const playing = startGame()
    expect(gameReducer(playing, { type: 'playAgain' })).toBe(playing)
    const aiTurn = gameReducer(playing, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(gameReducer(aiTurn, { type: 'playAgain' })).toBe(aiTurn)

    const prepared = winningPlayerTurn(playing)
    const gameOver = gameReducer(prepared.state, { type: 'playerFire', coord: prepared.finalCoord })
    const again = gameReducer(gameOver, { type: 'playAgain' })
    expect(again).toEqual(createInitialState(gameOver.matchId + 1, { ...gameOver.rewards, lastGame: null }))
    expect(again.phase).toBe('setup')
    expect(again.turnId).toBe(0)
    expect(again.setup.ships).toEqual([])
    expect(again.playerBoard.shots).toEqual([])
    expect(again.enemyBoard.ships).toEqual([])
  })

  it('keeps reducer inputs immutable', () => {
    const original = freezeDeep(createInitialState())
    const snapshot = JSON.stringify(original)
    const next = gameReducer(original, { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(next).not.toBe(original)
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(original.setup.ships).toEqual([])
  })

  it('exposes only public enemy cell information and own ship cells in player views', () => {
    const state = startGame(fleet(12), fleet(13))
    const target = shipCells(state.enemyBoard.ships[0]!)[0]!
    const hit = gameReducer(state, { type: 'playerFire', coord: target })
    const publicCells = enemyCellViews(hit)
    expect(publicCells[target.row]?.[target.col]).toEqual({ state: 'hit' })
    expect(publicCells.flat().filter((cell) => cell.state === 'unhit-ship')).toHaveLength(0)
    expect(publicCells.flat().some((cell) => cell.shipName !== undefined)).toBe(false)
    const ownShipCell = shipCells(state.playerBoard.ships[0]!)[0]!
    expect(playerCellViews(state)[ownShipCell.row]?.[ownShipCell.col]?.state).toBe('ship')
  })

  it('reveals unhit enemy ships only after game over', () => {
    const playing = startGame()
    expect(enemyCellViews(playing).flat().some((cell) => cell.state === 'unhit-ship')).toBe(false)
    const over = { ...playing, phase: 'gameOver' as const, winner: 'ai' as const }
    const revealed = enemyCellViews(over).flat()
    const unhitShips = revealed.filter((cell) => cell.state === 'unhit-ship')
    const shipCellCount = FLEET.reduce((total, ship) => total + ship.length, 0)
    expect(unhitShips).toHaveLength(shipCellCount)
    expect(unhitShips.every((cell) => typeof cell.shipName === 'string')).toBe(true)
    expect(revealed.filter((cell) => cell.state === 'untried'))
      .toHaveLength(BOARD_SIZE ** 2 - shipCellCount)
  })
})

describe('seeded reducer simulation', () => {
  it('finishes 50 full games without illegal or duplicate shots or moves after the win', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      let state = startGame(fleet(seed + 100), fleet(seed + 200))
      const playerRng = createRng(seed + 300)
      const aiRng = createRng(seed + 400)
      let acceptedShots = 0

      while (state.phase !== 'gameOver' && acceptedShots < 200) {
        const before = state
        if (state.phase === 'playerTurn') {
          const tried = new Set(state.enemyBoard.shots.map((entry) => coordKey(entry.coord)))
          const available = allCoords().filter((coord) => !tried.has(coordKey(coord)))
          const coord = pick(playerRng, available)
          expect(coord).toBeDefined()
          state = gameReducer(state, { type: 'playerFire', coord: coord! })
        } else if (state.phase === 'aiTurn') {
          const scheduled = { matchId: state.matchId, turnId: state.turnId }
          const coord = chooseAiShot(aiViewFromBoard(state.playerBoard), aiRng)
          expect(coord).not.toBeNull()
          state = gameReducer(state, { type: 'aiFire', coord: coord!, ...scheduled })
        }
        expect(state).not.toBe(before)
        acceptedShots += 1
      }

      expect(state.phase, `seed ${seed}`).toBe('gameOver')
      expect(acceptedShots).toBeLessThanOrEqual(200)
      expect(new Set(state.enemyBoard.shots.map((entry) => coordKey(entry.coord))).size)
        .toBe(state.enemyBoard.shots.length)
      expect(new Set(state.playerBoard.shots.map((entry) => coordKey(entry.coord))).size)
        .toBe(state.playerBoard.shots.length)
      if (state.winner === 'player') {
        expect(isFleetSunk(state.enemyBoard)).toBe(true)
        expect(isFleetSunk(state.playerBoard)).toBe(false)
      } else {
        expect(state.winner).toBe('ai')
        expect(isFleetSunk(state.playerBoard)).toBe(true)
        expect(isFleetSunk(state.enemyBoard)).toBe(false)
      }
      expect(gameReducer(state, { type: 'playerFire', coord: { row: 0, col: 0 } })).toBe(state)
      expect(gameReducer(state, {
        type: 'aiFire',
        coord: { row: 0, col: 0 },
        matchId: state.matchId,
        turnId: state.turnId,
      })).toBe(state)
    }
  })
})
