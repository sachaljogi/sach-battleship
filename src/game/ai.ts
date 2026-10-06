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

function uniqueCoords(coords: readonly Coord[]): Coord[] {
  const seen = new Set<string>()
  return coords.filter((coord) => {
    const key = coordKey(coord)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function lineRuns(hits: readonly Coord[]): Coord[][] {
  const runs: Coord[][] = []
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
          if (current.length >= 2) runs.push(current)
          current = []
        }
        current.push(hit)
      }
      if (current.length >= 2) runs.push(current)
    }
  }
  return runs
}

export function chooseAiShot(view: AiView, rng: Rng): Coord | null {
  const tried = new Set(view.shots.map((shot) => coordKey(shot.coord)))
  const untried = allCoords(view.boardSize).filter((coord) => !tried.has(coordKey(coord)))
  if (untried.length === 0) return null
  const untriedKeys = new Set(untried.map(coordKey))
  const sunkKeys = new Set(view.sunkShips.flatMap((ship) => ship.cells.map(coordKey)))
  const unresolvedHits = uniqueCoords(view.shots
    .filter((shot) => shot.outcome === 'hit' || shot.outcome === 'sunk')
    .map((shot) => shot.coord)
    .filter((coord) => !sunkKeys.has(coordKey(coord))))

  if (unresolvedHits.length > 0) {
    const runs = lineRuns(unresolvedHits)
    const lineCandidates = runs.map((run) => {
      const first = run[0]!
      const last = run.at(-1)!
      const rowDirection = last.row - first.row
      const colDirection = last.col - first.col
      return [
        { row: first.row - rowDirection, col: first.col - colDirection },
        { row: last.row + rowDirection, col: last.col + colDirection },
      ].filter((coord) => inBounds(coord, view.boardSize) && untriedKeys.has(coordKey(coord)))
        .map((coord) => ({ length: run.length, coord }))
    }).flat()

    if (lineCandidates.length > 0) {
      const longest = Math.max(...lineCandidates.map((candidate) => candidate.length))
      const candidates = uniqueCoords(lineCandidates
        .filter((candidate) => candidate.length === longest)
        .map((candidate) => candidate.coord))
      const choice = pick(rng, candidates)
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
