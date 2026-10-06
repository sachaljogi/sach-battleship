import { describe, expect, it } from 'vitest'
import {
  allCoords,
  coordKey,
  formatCoord,
  inBounds,
  orthogonalNeighbors,
  parseCoord,
  sameCoord,
} from '../coordinates'

describe('coordinates', () => {
  it('formats and parses board coordinates', () => {
    expect(formatCoord({ row: 0, col: 0 })).toBe('A1')
    expect(formatCoord({ row: 9, col: 9 })).toBe('J10')
    expect(parseCoord('C7')).toEqual({ row: 6, col: 2 })
    expect(parseCoord('j10')).toEqual({ row: 9, col: 9 })
    expect(parseCoord('K1')).toBeNull()
    expect(parseCoord('A0')).toBeNull()
  })

  it('checks bounds and coordinate identity', () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true)
    expect(inBounds({ row: 10, col: 9 })).toBe(false)
    expect(inBounds({ row: 1.5, col: 1 })).toBe(false)
    expect(coordKey({ row: 3, col: 2 })).toBe('3,2')
    expect(sameCoord({ row: 3, col: 2 }, { row: 3, col: 2 })).toBe(true)
  })

  it('enumerates cells and only in-bounds orthogonal neighbors', () => {
    expect(allCoords()).toHaveLength(100)
    expect(orthogonalNeighbors({ row: 0, col: 0 })).toEqual([
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ])
    expect(orthogonalNeighbors({ row: 5, col: 5 })).toHaveLength(4)
  })
})
