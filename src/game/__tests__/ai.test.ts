import { describe, expect, it } from 'vitest'
import { allCoords, coordKey, inBounds } from '../coordinates'
import { chooseAiShot, type AiShotRecord, type AiView } from '../ai'
import { createRng, shuffle } from '../rng'
import { aiViewFromBoard } from '../state'
import { fireAt } from '../shots'
import { randomFleet } from '../placement'
import type { Board, Coord } from '../types'

const view = (shots: AiShotRecord[] = [], sunkShips: AiView['sunkShips'] = [], boardSize = 10): AiView => ({
  boardSize,
  shots,
  sunkShips,
})

const shot = (row: number, col: number, outcome: AiShotRecord['outcome'] = 'hit'): AiShotRecord => ({
  coord: { row, col },
  outcome,
})

function openLineEnds(aiView: AiView): Set<string> {
  const tried = new Set(aiView.shots.map((entry) => coordKey(entry.coord)))
  const sunk = new Set(aiView.sunkShips.flatMap((ship) => ship.cells.map(coordKey)))
  const hits = aiView.shots
    .filter((entry) => entry.outcome !== 'miss' && !sunk.has(coordKey(entry.coord)))
    .map((entry) => entry.coord)
  const hitKeys = new Set(hits.map(coordKey))
  const ends = new Set<string>()
  for (const hit of hits) {
    for (const step of [{ row: 0, col: 1 }, { row: 1, col: 0 }]) {
      const next = { row: hit.row + step.row, col: hit.col + step.col }
      if (!hitKeys.has(coordKey(next))) continue
      let start: Coord = hit
      while (hitKeys.has(coordKey({ row: start.row - step.row, col: start.col - step.col }))) {
        start = { row: start.row - step.row, col: start.col - step.col }
      }
      let end: Coord = next
      while (hitKeys.has(coordKey({ row: end.row + step.row, col: end.col + step.col }))) {
        end = { row: end.row + step.row, col: end.col + step.col }
      }
      for (const candidate of [
        { row: start.row - step.row, col: start.col - step.col },
        { row: end.row + step.row, col: end.col + step.col },
      ]) {
        if (inBounds(candidate) && !tried.has(coordKey(candidate))) ends.add(coordKey(candidate))
      }
    }
  }
  return ends
}

describe('AI shot selection', () => {
  it('probes only untried orthogonal neighbors after a corner hit', () => {
    const candidates = new Set(['1,0', '0,1'])
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view([shot(0, 0)]), createRng(seed))
      expect(choice && candidates.has(coordKey(choice))).toBe(true)
    }
    const blocked = chooseAiShot(view([
      shot(0, 0),
      shot(1, 0, 'miss'),
      shot(0, 1, 'miss'),
    ]), createRng(1))
    expect(blocked).not.toBeNull()
    expect(['1,0', '0,1']).not.toContain(coordKey(blocked!))
  })

  it('extends aligned hits only along their line', () => {
    const choice = chooseAiShot(view([shot(4, 1), shot(4, 2)]), createRng(44))
    expect(choice).not.toBeNull()
    expect([coordKey({ row: 4, col: 0 }), coordKey({ row: 4, col: 3 })])
      .toContain(coordKey(choice!))
  })

  it('chooses the other line end when one end is blocked by a miss or board edge', () => {
    const missBlocked = chooseAiShot(view([
      shot(4, 0, 'miss'),
      shot(4, 1),
      shot(4, 2),
    ]), createRng(2))
    expect(missBlocked).toEqual({ row: 4, col: 3 })

    const edgeBlocked = chooseAiShot(view([shot(0, 0), shot(0, 1)]), createRng(3))
    expect(edgeBlocked).toEqual({ row: 0, col: 2 })
  })

  it('keeps targeting unresolved hits after another ship sinks', () => {
    const sunkCells = [{ row: 3, col: 3 }, { row: 3, col: 4 }]
    const choice = chooseAiShot(view([
      shot(1, 1),
      shot(3, 3),
      shot(3, 4, 'sunk'),
    ], [{ name: 'Destroyer', cells: sunkCells }]), createRng(5))
    const candidates = new Set(['0,1', '2,1', '1,0', '1,2'])
    expect(choice && candidates.has(coordKey(choice))).toBe(true)
  })

  it('shoots the square right after a line of three hits instead of skipping a box', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view([shot(1, 1), shot(1, 2), shot(1, 3)]), createRng(seed))
      expect(choice && ['1,0', '1,4'].includes(coordKey(choice)), `seed ${seed}`).toBe(true)
    }
    const oneEnd = chooseAiShot(view([shot(1, 0, 'miss'), shot(1, 1), shot(1, 2), shot(1, 3)]), createRng(1))
    expect(oneEnd).toEqual({ row: 1, col: 4 })
    const vertical = chooseAiShot(view([shot(7, 6), shot(8, 6), shot(9, 6)]), createRng(2))
    expect(vertical).toEqual({ row: 6, col: 6 })
  })

  it('keeps extending a line of four hits to the untried end', () => {
    const choice = chooseAiShot(view([shot(5, 2), shot(5, 3), shot(5, 4), shot(5, 5), shot(5, 1, 'miss')]), createRng(9))
    expect(choice).toEqual({ row: 5, col: 6 })
  })

  it('prefers the open end of a line over the neighbors of a lone hit', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view([shot(0, 0), shot(6, 6), shot(6, 7)]), createRng(seed))
      expect(choice && ['6,5', '6,8'].includes(coordKey(choice)), `seed ${seed}`).toBe(true)
    }
  })

  it('tries the squares beside a line that is blocked at both ends before any other hit', () => {
    const blocked = [
      shot(0, 0),
      shot(4, 2, 'miss'),
      shot(4, 3),
      shot(4, 4),
      shot(4, 5, 'miss'),
    ]
    const sides = new Set(['3,3', '3,4', '5,3', '5,4'])
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view(blocked), createRng(seed))
      expect(choice && sides.has(coordKey(choice)), `seed ${seed}`).toBe(true)
    }
    const edgeBlocked = chooseAiShot(view([shot(0, 0), shot(0, 1), shot(0, 2, 'miss')]), createRng(3))
    expect(['1,0', '1,1']).toContain(coordKey(edgeBlocked!))
  })

  it('follows up the most recent lone hit first', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view([shot(0, 0), shot(5, 5)]), createRng(seed))
      expect(choice && ['4,5', '6,5', '5,4', '5,6'].includes(coordKey(choice)), `seed ${seed}`).toBe(true)
    }
    const older = chooseAiShot(view([
      shot(5, 5),
      shot(0, 0),
      shot(0, 1, 'miss'),
      shot(1, 0, 'miss'),
    ]), createRng(4))
    expect(['4,5', '6,5', '5,4', '5,6']).toContain(coordKey(older!))
  })

  it('finishes the line that was hit most recently when two lines are equally long', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const choice = chooseAiShot(view([shot(2, 2), shot(2, 3), shot(7, 7), shot(7, 8)]), createRng(seed))
      expect(choice && ['7,6', '7,9'].includes(coordKey(choice)), `seed ${seed}`).toBe(true)
    }
  })

  it('still extends a line after a touching ship sinks and its cells are removed', () => {
    const sunkCells = [{ row: 3, col: 3 }, { row: 3, col: 4 }]
    const shots = [shot(3, 1), shot(3, 2), shot(3, 3), shot(3, 4, 'sunk')]
    const choice = chooseAiShot(view(shots, [{ name: 'Destroyer', cells: sunkCells }]), createRng(5))
    expect(choice).toEqual({ row: 3, col: 0 })
  })

  it('always shoots an open end whenever a line of two or more hits has one (seeded games)', () => {
    let lineShots = 0
    for (let seed = 0; seed < 150; seed += 1) {
      let board: Board = { ships: randomFleet(createRng(seed + 1000)), shots: [] }
      const rng = createRng(seed + 5000)
      for (let turn = 0; turn < 100; turn += 1) {
        const aiView = aiViewFromBoard(board)
        if (aiView.sunkShips.length === board.ships.length) break
        const ends = openLineEnds(aiView)
        const choice = chooseAiShot(aiView, rng)
        expect(choice).not.toBeNull()
        if (ends.size > 0) {
          lineShots += 1
          expect(ends.has(coordKey(choice!)), `seed ${seed} turn ${turn}`).toBe(true)
        }
        const result = fireAt(board, choice!)
        expect(result.ok).toBe(true)
        if (result.ok) board = result.board
      }
    }
    expect(lineShots).toBeGreaterThan(500)
  })

  it('hunts checkerboard cells while any remain, then uses other untried cells', () => {
    const size = 4
    const evenCells = allCoords(size).filter((coord) => (coord.row + coord.col) % 2 === 0)
    const firstChoice = chooseAiShot(view([], [], size), createRng(6))
    expect(firstChoice).not.toBeNull()
    expect((firstChoice!.row + firstChoice!.col) % 2).toBe(0)
    const choice = chooseAiShot(view(evenCells.map((coord) => ({ coord, outcome: 'miss' })), [], size), createRng(7))
    expect(choice).not.toBeNull()
    expect((choice!.row + choice!.col) % 2).toBe(1)
  })

  it('never returns a tried cell and returns null only when the board is full', () => {
    const full = allCoords(3).map((coord) => ({ coord, outcome: 'miss' as const }))
    expect(chooseAiShot(view(full, [], 3), createRng(8))).toBeNull()
    for (let seed = 0; seed < 40; seed += 1) {
      const rng = createRng(seed)
      const shots = shuffle(rng, allCoords()).slice(0, seed * 2).map((coord, index) => ({
        coord,
        outcome: (index % 3 === 0 ? 'hit' : 'miss') as AiShotRecord['outcome'],
      }))
      const result = chooseAiShot(view(shots), rng)
      expect(result).not.toBeNull()
      expect(inBounds(result!)).toBe(true)
      expect(shots.some((entry) => coordKey(entry.coord) === coordKey(result!))).toBe(false)
    }
  })

  it('uses only the same public information when hidden fleets differ', () => {
    const firstFleet: Board['ships'] = [
      { id: 'carrier', origin: { row: 0, col: 0 }, orientation: 'vertical' },
      { id: 'battleship', origin: { row: 0, col: 2 }, orientation: 'vertical' },
      { id: 'cruiser', origin: { row: 0, col: 4 }, orientation: 'vertical' },
      { id: 'submarine', origin: { row: 0, col: 6 }, orientation: 'vertical' },
      { id: 'destroyer', origin: { row: 0, col: 8 }, orientation: 'vertical' },
    ]
    const secondFleet: Board['ships'] = [
      { id: 'carrier', origin: { row: 0, col: 9 }, orientation: 'vertical' },
      { id: 'battleship', origin: { row: 0, col: 7 }, orientation: 'vertical' },
      { id: 'cruiser', origin: { row: 0, col: 5 }, orientation: 'vertical' },
      { id: 'submarine', origin: { row: 0, col: 3 }, orientation: 'vertical' },
      { id: 'destroyer', origin: { row: 0, col: 8 }, orientation: 'vertical' },
    ]
    let first = { ships: firstFleet, shots: [] } as Board
    let second = { ships: secondFleet, shots: [] } as Board
    for (const coord of [{ row: 0, col: 8 }, { row: 1, col: 8 }, { row: 9, col: 0 }]) {
      const firstShot = fireAt(first, coord)
      const secondShot = fireAt(second, coord)
      expect(firstShot.ok && firstShot.shot.outcome).toBe(secondShot.ok && secondShot.shot.outcome)
      if (firstShot.ok && secondShot.ok) {
        first = firstShot.board
        second = secondShot.board
      }
    }
    expect(first.ships).not.toEqual(second.ships)
    const firstView = aiViewFromBoard(first)
    const secondView = aiViewFromBoard(second)
    expect(firstView.shots).toEqual(secondView.shots)
    expect(firstView.sunkShips).toEqual(secondView.sunkShips)
    expect(firstView).toEqual(secondView)
    expect(Object.keys(firstView)).not.toContain('ships')
    expect(chooseAiShot(firstView, createRng(99))).toEqual(chooseAiShot(secondView, createRng(99)))
  })
})
