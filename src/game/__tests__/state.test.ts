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

  it('clears setup errors on success, re-places selected ships, and supports randomize and clear', () => {
    let state = gameReducer(createInitialState(), { type: 'placeShip', coord: { row: 9, col: 9 } })
    state = gameReducer(state, { type: 'placeShip', coord: { row: 0, col: 0 } })
    expect(state.setup.error).toBeNull()
    expect(state.setup.ships).toHaveLength(1)
    state = gameReducer(state, { type: 'selectShip', shipId: 'carrier' })
    state = gameReducer(state, { type: 'placeShip', coord: { row: 2, col: 0 } })
    expect(state.setup.ships).toHaveLength(1)
    expect(state.setup.ships[0]?.origin).toEqual({ row: 2, col: 0 })
    const randomized = gameReducer(state, { type: 'randomizeFleet', ships: fleet(8) })
    expect(isCompleteValidFleet(randomized.setup.ships)).toBe(true)
    expect(randomized.setup.error).toBeNull()
    const cleared = gameReducer(randomized, { type: 'clearBoard' })
    expect(cleared.setup.ships).toEqual([])
    expect(cleared.setup.error).toBeNull()
  })

  it('allows newGame during a match but rejects it during setup', () => {
    const setup = createInitialState()
    expect(gameReducer(setup, { type: 'newGame' })).toBe(setup)

    const playing = startGame()
    const duringPlayerTurn = gameReducer(playing, { type: 'newGame' })
    expect(duringPlayerTurn).toEqual(createInitialState(playing.matchId + 1))

    const aiTurn = gameReducer(playing, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(gameReducer(aiTurn, { type: 'newGame' })).toEqual(createInitialState(aiTurn.matchId + 1))

    const prepared = winningPlayerTurn(playing)
    const gameOver = gameReducer(prepared.state, { type: 'playerFire', coord: prepared.finalCoord })
    expect(gameOver.phase).toBe('gameOver')
    expect(gameReducer(gameOver, { type: 'newGame' })).toEqual(createInitialState(gameOver.matchId + 1))
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
    expect(again).toEqual(createInitialState(gameOver.matchId + 1))
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
