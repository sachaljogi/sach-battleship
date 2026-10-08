import { describe, expect, it } from 'vitest'
import { randomFleet } from '../game/placement'
import { createRng } from '../game/rng'
import { gameReducer, createInitialState } from '../game/state'
import {
  describeEnemyCell,
  describePlayerCell,
  liveMessageForState,
  placementErrorMessage,
  placementSuccessMessage,
} from './messages'

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
      .toBe('Enemy waters, C7, untried')
    expect(describeEnemyCell({ row: 6, col: 2 }, { state: 'hit' }))
      .toBe('Enemy waters, C7, hit')
    expect(describeEnemyCell({ row: 6, col: 2 }, { state: 'sunk', shipName: 'Cruiser' }))
      .toBe('Enemy waters, C7, sunk Cruiser')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'ship', shipName: 'Carrier' }))
      .toBe('Your fleet, A1, Carrier')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'hit', shipName: 'Carrier' }))
      .toBe('Your fleet, A1, Carrier, hit')
    expect(describePlayerCell({ row: 0, col: 0 }, { state: 'untried' }))
      .toBe('Your fleet, A1, empty')
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
    expect(liveMessageForState(playerTurn)).toBe('Your turn — fire on Enemy waters')

    const aiTurn = gameReducer(playerTurn, { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(liveMessageForState(aiTurn)).toContain('AI is thinking...')
    expect(liveMessageForState(aiTurn)).toContain('You fired at A1:')

    const gameOver = { ...playerTurn, phase: 'gameOver' as const, winner: 'player' as const }
    expect(liveMessageForState(gameOver)).toContain('You win!')
  })
})
