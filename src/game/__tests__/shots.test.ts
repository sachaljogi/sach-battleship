import { describe, expect, it } from 'vitest'
import { fireAt, isFleetSunk, isShipSunk, remainingShips, sunkShipIds } from '../shots'
import { freezeDeep } from './helpers'
import type { Board, PlacedShip } from '../types'

const ships: PlacedShip[] = [
  { id: 'destroyer', origin: { row: 0, col: 0 }, orientation: 'horizontal' },
  { id: 'submarine', origin: { row: 2, col: 2 }, orientation: 'vertical' },
]

describe('shots', () => {
  it('reports a miss, ordinary hits, and a sunk ship on its exact final cell', () => {
    let board: Board = { ships, shots: [] }
    const miss = fireAt(board, { row: 9, col: 9 })
    expect(miss.ok && miss.shot).toEqual({ coord: { row: 9, col: 9 }, outcome: 'miss' })
    if (!miss.ok) throw new Error('Expected a valid miss')
    board = miss.board
    const hit = fireAt(board, { row: 0, col: 0 })
    expect(hit.ok && hit.shot).toEqual({ coord: { row: 0, col: 0 }, outcome: 'hit' })
    if (!hit.ok) throw new Error('Expected a valid hit')
    board = hit.board
    const finalHit = fireAt(board, { row: 0, col: 1 })
    expect(finalHit.ok && finalHit.shot).toEqual({
      coord: { row: 0, col: 1 },
      outcome: 'sunk',
      sunkShipId: 'destroyer',
    })
    if (!finalHit.ok) throw new Error('Expected a valid sinking shot')
    expect(finalHit.board.shots.slice(1).map((shot) => shot.sunkShipId)).toEqual([undefined, 'destroyer'])
    expect(isShipSunk(finalHit.board, 'destroyer')).toBe(true)
    expect(isShipSunk(finalHit.board, 'submarine')).toBe(false)
    expect(sunkShipIds(finalHit.board)).toEqual(['destroyer'])
    expect(remainingShips(finalHit.board).map((ship) => ship.id)).toEqual(['submarine'])
    expect(isFleetSunk(finalHit.board)).toBe(false)
    let full = finalHit.board
    for (const coord of [{ row: 2, col: 2 }, { row: 3, col: 2 }, { row: 4, col: 2 }]) {
      const next = fireAt(full, coord)
      expect(next.ok).toBe(true)
      if (next.ok) full = next.board
    }
    expect(isFleetSunk(full)).toBe(true)
  })

  it('rejects repeated and out-of-bounds shots without changing the board', () => {
    const first = fireAt({ ships, shots: [] }, { row: 0, col: 0 })
    if (!first.ok) throw new Error('Expected a valid shot')
    const before = structuredClone(first.board)
    expect(fireAt(first.board, { row: 0, col: 0 })).toEqual({ ok: false, reason: 'repeat' })
    expect(fireAt(first.board, { row: 10, col: 0 })).toEqual({ ok: false, reason: 'out-of-bounds' })
    expect(first.board).toEqual(before)
  })

  it('does not mutate a deeply frozen input board when firing', () => {
    const board = freezeDeep<Board>({ ships: structuredClone(ships), shots: [] })
    expect(() => fireAt(board, { row: 0, col: 0 })).not.toThrow()
    expect(board.shots).toEqual([])
  })

  it('does not count misses toward a ship sinking', () => {
    const board: Board = {
      ships: [ships[0]!],
      shots: [
        { coord: { row: 0, col: 0 }, outcome: 'miss' },
        { coord: { row: 0, col: 1 }, outcome: 'miss' },
      ],
    }
    expect(isShipSunk(board, 'destroyer')).toBe(false)
    expect(isFleetSunk(board)).toBe(false)
  })
})
