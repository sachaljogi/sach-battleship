import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { isCompleteValidFleet, placeShip, randomFleet, shipCells, validatePlacement } from '../placement'
import type { PlacedShip } from '../types'

const ship = (id: PlacedShip['id'], row: number, col: number, orientation: PlacedShip['orientation']): PlacedShip => ({
  id,
  origin: { row, col },
  orientation,
})

describe('placement', () => {
  it('allows placements at A1 and rejects ship footprints extending beyond J10', () => {
    expect(validatePlacement([], ship('carrier', 0, 0, 'horizontal'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('carrier', 0, 0, 'vertical'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('destroyer', 9, 8, 'horizontal'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('destroyer', 8, 9, 'vertical'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('destroyer', 9, 9, 'horizontal'))).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    })
    expect(validatePlacement([], ship('destroyer', 9, 9, 'vertical'))).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    })
  })

  it('accepts ships that exactly fit an edge and rejects them one cell over', () => {
    expect(validatePlacement([], ship('battleship', 0, 6, 'horizontal'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('battleship', 0, 7, 'horizontal'))).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    })
    expect(validatePlacement([], ship('battleship', 6, 0, 'vertical'))).toEqual({ ok: true })
    expect(validatePlacement([], ship('battleship', 7, 0, 'vertical'))).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    })
  })

  it('reports overlap and the conflicting ship id', () => {
    const existing = ship('carrier', 0, 0, 'horizontal')
    expect(validatePlacement([existing], ship('battleship', 0, 3, 'vertical'))).toEqual({
      ok: false,
      reason: 'overlap',
      conflictingShipId: 'carrier',
    })
  })

  it('allows adjacent and end-to-end ships to touch', () => {
    const first = ship('destroyer', 0, 0, 'horizontal')
    expect(validatePlacement([first], ship('carrier', 1, 0, 'horizontal'))).toEqual({ ok: true })
    expect(validatePlacement([first], ship('battleship', 0, 2, 'horizontal'))).toEqual({ ok: true })
  })

  it('replaces a ship with the same id and does not mutate the input array', () => {
    const original = [ship('destroyer', 0, 0, 'horizontal')]
    const before = structuredClone(original)
    const result = placeShip(original, ship('destroyer', 3, 3, 'vertical'))
    expect(result).toEqual({
      ok: true,
      ships: [ship('destroyer', 3, 3, 'vertical')],
    })
    expect(original).toEqual(before)
    expect(result.ok && result.ships).not.toBe(original)
  })

  it('returns ordered cell coordinates for either orientation', () => {
    expect(shipCells(ship('submarine', 2, 3, 'horizontal'))).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ])
    expect(shipCells(ship('submarine', 2, 3, 'vertical'))).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 3 },
      { row: 4, col: 3 },
    ])
  })

  it('generates complete valid fleets deterministically for fixed seeds', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const generated = randomFleet(createRng(seed))
      expect(isCompleteValidFleet(generated), `seed ${seed}`).toBe(true)
      expect(randomFleet(createRng(seed))).toEqual(generated)
    }
  })

  it('rejects duplicate, missing, overlapping, or out-of-bounds fleets', () => {
    const complete = randomFleet(createRng(55))
    expect(isCompleteValidFleet(complete)).toBe(true)
    expect(isCompleteValidFleet(complete.slice(1))).toBe(false)
    expect(isCompleteValidFleet([...complete.slice(1), complete[0]!])).toBe(true)
    expect(isCompleteValidFleet([...complete, complete[0]!])).toBe(false)
    const overlap = complete.map((entry, index) => (
      index === 1 ? { ...entry, origin: { ...complete[0]!.origin }, orientation: complete[0]!.orientation } : entry
    ))
    expect(isCompleteValidFleet(overlap)).toBe(false)
    const outside = complete.map((entry, index) => (
      index === 0 ? { ...entry, origin: { row: 9, col: 9 } } : entry
    ))
    expect(isCompleteValidFleet(outside)).toBe(false)
  })
})
