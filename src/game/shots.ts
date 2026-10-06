import { coordKey, inBounds, sameCoord } from './coordinates'
import { shipCells } from './placement'
import { type Board, type Coord, type PlacedShip, type ShipId, type Shot } from './types'

export type FireResult =
  | { ok: false; reason: 'out-of-bounds' | 'repeat' }
  | { ok: true; board: Board; shot: Shot }

export function shipAt(board: Board, coord: Coord): PlacedShip | undefined {
  return board.ships.find((ship) => shipCells(ship).some((cell) => sameCoord(cell, coord)))
}

export function isShipSunk(board: Board, id: ShipId): boolean {
  const ship = board.ships.find((candidate) => candidate.id === id)
  if (!ship) return false
  const shotKeys = new Set(board.shots
    .filter((shot) => shot.outcome !== 'miss')
    .map((shot) => coordKey(shot.coord)))
  return shipCells(ship).every((cell) => shotKeys.has(coordKey(cell)))
}

export function sunkShipIds(board: Board): ShipId[] {
  return board.ships.filter((ship) => isShipSunk(board, ship.id)).map((ship) => ship.id)
}

export function remainingShips(board: Board): PlacedShip[] {
  return board.ships.filter((ship) => !isShipSunk(board, ship.id))
}

export function isFleetSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((ship) => isShipSunk(board, ship.id))
}

export function fireAt(board: Board, coord: Coord): FireResult {
  if (!inBounds(coord)) return { ok: false, reason: 'out-of-bounds' }
  if (board.shots.some((shot) => sameCoord(shot.coord, coord))) return { ok: false, reason: 'repeat' }

  const ship = shipAt(board, coord)
  let shot: Shot
  if (!ship) {
    shot = { coord: { ...coord }, outcome: 'miss' }
  } else {
    const previousHits = board.shots.filter((existing) => (
      existing.outcome !== 'miss'
      && shipCells(ship).some((cell) => sameCoord(cell, existing.coord))
    )).length
    const outcome = previousHits + 1 === shipCells(ship).length ? 'sunk' : 'hit'
    shot = outcome === 'sunk'
      ? { coord: { ...coord }, outcome, sunkShipId: ship.id }
      : { coord: { ...coord }, outcome }
  }

  return {
    ok: true,
    board: { ships: [...board.ships], shots: [...board.shots, shot] },
    shot,
  }
}
