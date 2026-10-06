import { describe, expect, it } from 'vitest'
import { allCoords, coordKey, inBounds } from '../coordinates'
import { chooseAiShot, type AiShotRecord, type AiView } from '../ai'
import { createRng, shuffle } from '../rng'
import { aiViewFromBoard } from '../state'
import { fireAt } from '../shots'
import type { Board } from '../types'

const view = (shots: AiShotRecord[] = [], sunkShips: AiView['sunkShips'] = [], boardSize = 10): AiView => ({
  boardSize,
  shots,
  sunkShips,
})

const shot = (row: number, col: number, outcome: AiShotRecord['outcome'] = 'hit'): AiShotRecord => ({
  coord: { row, col },
  outcome,
})

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
