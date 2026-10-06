import { createRng } from '../rng'
import { gameReducer, createInitialState } from '../state'
import { randomFleet, shipCells } from '../placement'
import type { Coord, PlacedShip } from '../types'

export function fleet(seed: number): PlacedShip[] {
  return randomFleet(createRng(seed))
}

export function startGame(playerShips = fleet(10), enemyShips = fleet(20)) {
  const setup = gameReducer(createInitialState(), { type: 'randomizeFleet', ships: playerShips })
  return gameReducer(setup, { type: 'startGame', enemyShips })
}

export function fleetCells(ships: readonly PlacedShip[]): Coord[] {
  return ships.flatMap((ship) => shipCells(ship))
}

export function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((child) => freezeDeep(child))
    Object.freeze(value)
  }
  return value
}
