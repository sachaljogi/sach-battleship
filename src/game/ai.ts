import { allCoords, coordKey, inBounds, orthogonalNeighbors } from './coordinates'
import { pick, type Rng } from './rng'
import type { Coord, ShotOutcome } from './types'

export interface AiShotRecord {
  coord: Coord
  outcome: ShotOutcome
}

export interface AiView {
  boardSize: number
  shots: readonly AiShotRecord[]
  sunkShips: readonly { name: string; cells: readonly Coord[] }[]
}

interface Run {
  cells: Coord[]
  axis: 'row' | 'col'
  latest: number
}

function uniqueCoords(coords: readonly Coord[]): Coord[] {
  const seen = new Set<string>()
  return coords.filter((coord) => {
    const key = coordKey(coord)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function lineRuns(hits: readonly Coord[], order: ReadonlyMap<string, number>): Run[] {
  const runs: Run[] = []
  const latestOf = (cells: Coord[]) => Math.max(...cells.map((cell) => order.get(coordKey(cell)) ?? -1))
  for (const axis of ['row', 'col'] as const) {
    const groups = new Map<number, Coord[]>()
    for (const hit of hits) {
      const fixed = axis === 'row' ? hit.row : hit.col
      const group = groups.get(fixed) ?? []
      group.push(hit)
      groups.set(fixed, group)
    }
    for (const group of groups.values()) {
      group.sort((left, right) => (axis === 'row' ? left.col - right.col : left.row - right.row))
      let current: Coord[] = []
      for (const hit of group) {
        const previous = current.at(-1)
        const previousValue = previous && (axis === 'row' ? previous.col : previous.row)
        const value = axis === 'row' ? hit.col : hit.row
        if (previous && value !== previousValue! + 1) {
          if (current.length >= 2) runs.push({ cells: current, axis, latest: latestOf(current) })
          current = []
        }
        current.push(hit)
      }
      if (current.length >= 2) runs.push({ cells: current, axis, latest: latestOf(current) })
    }
  }
  return runs
}

function openEnds(run: Run, boardSize: number, untriedKeys: ReadonlySet<string>): Coord[] {
  const first = run.cells[0]!
  const last = run.cells.at(-1)!
  const step = run.axis === 'row' ? { row: 0, col: 1 } : { row: 1, col: 0 }
  return [
    { row: first.row - step.row, col: first.col - step.col },
    { row: last.row + step.row, col: last.col + step.col },
  ].filter((coord) => inBounds(coord, boardSize) && untriedKeys.has(coordKey(coord)))
}

function sideNeighbors(run: Run, boardSize: number, untriedKeys: ReadonlySet<string>): Coord[] {
  const step = run.axis === 'row' ? { row: 1, col: 0 } : { row: 0, col: 1 }
  return uniqueCoords(run.cells.flatMap((cell) => [
    { row: cell.row - step.row, col: cell.col - step.col },
    { row: cell.row + step.row, col: cell.col + step.col },
  ])).filter((coord) => inBounds(coord, boardSize) && untriedKeys.has(coordKey(coord)))
}

function preferred(runs: Run[]): Run[] {
  const longest = Math.max(...runs.map((run) => run.cells.length))
  const longestRuns = runs.filter((run) => run.cells.length === longest)
  const latest = Math.max(...longestRuns.map((run) => run.latest))
  return longestRuns.filter((run) => run.latest === latest)
}

export function chooseAiShot(view: AiView, rng: Rng): Coord | null {
  const tried = new Set(view.shots.map((shot) => coordKey(shot.coord)))
  const untried = allCoords(view.boardSize).filter((coord) => !tried.has(coordKey(coord)))
  if (untried.length === 0) return null
  const untriedKeys = new Set(untried.map(coordKey))
  const sunkKeys = new Set(view.sunkShips.flatMap((ship) => ship.cells.map(coordKey)))
  const order = new Map(view.shots.map((shot, index) => [coordKey(shot.coord), index] as const))
  const unresolvedHits = uniqueCoords(view.shots
    .filter((shot) => shot.outcome === 'hit' || shot.outcome === 'sunk')
    .map((shot) => shot.coord)
    .filter((coord) => !sunkKeys.has(coordKey(coord))))
    .sort((left, right) => (order.get(coordKey(right)) ?? -1) - (order.get(coordKey(left)) ?? -1))

  if (unresolvedHits.length > 0) {
    const runs = lineRuns(unresolvedHits, order)
    const extendable = runs.filter((run) => openEnds(run, view.boardSize, untriedKeys).length > 0)
    if (extendable.length > 0) {
      const ends = uniqueCoords(preferred(extendable).flatMap((run) => openEnds(run, view.boardSize, untriedKeys)))
      const choice = pick(rng, ends)
      if (choice) return choice
    }

    const blocked = runs.filter((run) => sideNeighbors(run, view.boardSize, untriedKeys).length > 0)
    if (blocked.length > 0) {
      const sides = uniqueCoords(preferred(blocked).flatMap((run) => sideNeighbors(run, view.boardSize, untriedKeys)))
      const choice = pick(rng, sides)
      if (choice) return choice
    }

    const inRun = new Set(runs.flatMap((run) => run.cells.map(coordKey)))
    const singles = unresolvedHits.filter((hit) => !inRun.has(coordKey(hit)))
    for (const hit of singles) {
      const neighbors = orthogonalNeighbors(hit, view.boardSize).filter((coord) => untriedKeys.has(coordKey(coord)))
      const choice = pick(rng, neighbors)
      if (choice) return choice
    }

    const neighbors = uniqueCoords(unresolvedHits.flatMap((hit) => orthogonalNeighbors(hit, view.boardSize)))
      .filter((coord) => untriedKeys.has(coordKey(coord)))
    const target = pick(rng, neighbors)
    if (target) return target
  }

  const checkerboard = untried.filter((coord) => (coord.row + coord.col) % 2 === 0)
  return pick(rng, checkerboard.length > 0 ? checkerboard : untried) ?? null
}
