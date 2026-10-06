import { allCoords, BOARD_SIZE, inBounds } from './coordinates'
import { shuffle, type Rng } from './rng'
import { FLEET, type Coord, type PlacedShip, type ShipId } from './types'

export type PlacementFailure = {
  ok: false
  reason: 'out-of-bounds' | 'overlap'
  conflictingShipId?: ShipId
}

export type PlacementResult = { ok: true } | PlacementFailure
export type PlaceShipResult = { ok: true; ships: PlacedShip[] } | PlacementFailure

const shipLength = (id: ShipId): number | undefined => FLEET.find((ship) => ship.id === id)?.length

export function shipCells(ship: PlacedShip): Coord[] {
  const length = shipLength(ship.id)
  if (length === undefined) return []
  return Array.from({ length }, (_, offset) => ({
    row: ship.origin.row + (ship.orientation === 'vertical' ? offset : 0),
    col: ship.origin.col + (ship.orientation === 'horizontal' ? offset : 0),
  }))
}

export function validatePlacement(ships: readonly PlacedShip[], candidate: PlacedShip): PlacementResult {
  const cells = shipCells(candidate)
  if (cells.length === 0 || cells.some((cell) => !inBounds(cell))) {
    return { ok: false, reason: 'out-of-bounds' }
  }

  for (const other of ships) {
    if (other.id === candidate.id) continue
    const otherCells = shipCells(other)
    const conflict = cells.find((cell) => otherCells.some((otherCell) => (
      cell.row === otherCell.row && cell.col === otherCell.col
    )))
    if (conflict) return { ok: false, reason: 'overlap', conflictingShipId: other.id }
  }
  return { ok: true }
}

export function placeShip(ships: readonly PlacedShip[], candidate: PlacedShip): PlaceShipResult {
  const validation = validatePlacement(ships, candidate)
  if (!validation.ok) return validation
  return {
    ok: true,
    ships: [...ships.filter((ship) => ship.id !== candidate.id), candidate],
  }
}

export function isCompleteValidFleet(ships: readonly PlacedShip[]): boolean {
  if (ships.length !== FLEET.length) return false
  const ids = new Set(ships.map((ship) => ship.id))
  if (ids.size !== FLEET.length || FLEET.some((spec) => !ids.has(spec.id))) return false
  return ships.every((ship, index) => validatePlacement(ships.slice(0, index), ship).ok)
}

function candidatesFor(id: ShipId): PlacedShip[] {
  return allCoords(BOARD_SIZE).flatMap((origin) => (
    (['horizontal', 'vertical'] as const).map((orientation) => ({ id, origin, orientation }))
  ))
}

export function randomFleet(rng: Rng): PlacedShip[] {
  const orderedIds = [...FLEET]
    .sort((left, right) => right.length - left.length)
    .map((ship) => ship.id)

  const search = (index: number, placed: PlacedShip[]): PlacedShip[] | null => {
    if (index === orderedIds.length) return placed
    const shipId = orderedIds[index]
    if (!shipId) return null
    const legal = candidatesFor(shipId).filter((candidate) => validatePlacement(placed, candidate).ok)
    for (const candidate of shuffle(rng, legal)) {
      const result = search(index + 1, [...placed, candidate])
      if (result) return result
    }
    return null
  }

  const fleet = search(0, [])
  if (!fleet) throw new Error('Unable to generate a valid fleet')
  return fleet
}
