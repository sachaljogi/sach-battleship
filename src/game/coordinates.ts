import type { Coord } from './types'

export const BOARD_SIZE = 10
export const COLUMN_LABELS = 'ABCDEFGHIJ'

export function formatCoord(coord: Coord): string {
  return `${COLUMN_LABELS[coord.col] ?? '?'}${coord.row + 1}`
}

export function parseCoord(label: string): Coord | null {
  const match = /^([A-J])(10|[1-9])$/i.exec(label)
  if (!match) return null
  return {
    row: Number(match[2]) - 1,
    col: COLUMN_LABELS.indexOf(match[1]!.toUpperCase()),
  }
}

export function inBounds(coord: Coord, boardSize = BOARD_SIZE): boolean {
  return Number.isInteger(coord.row)
    && Number.isInteger(coord.col)
    && coord.row >= 0
    && coord.row < boardSize
    && coord.col >= 0
    && coord.col < boardSize
}

export function coordKey(coord: Coord): string {
  return `${coord.row},${coord.col}`
}

export function sameCoord(left: Coord, right: Coord): boolean {
  return left.row === right.row && left.col === right.col
}

export function orthogonalNeighbors(coord: Coord, boardSize = BOARD_SIZE): Coord[] {
  return [
    { row: coord.row - 1, col: coord.col },
    { row: coord.row + 1, col: coord.col },
    { row: coord.row, col: coord.col - 1 },
    { row: coord.row, col: coord.col + 1 },
  ].filter((neighbor) => inBounds(neighbor, boardSize))
}

export function allCoords(boardSize = BOARD_SIZE): Coord[] {
  return Array.from({ length: boardSize * boardSize }, (_, index) => ({
    row: Math.floor(index / boardSize),
    col: index % boardSize,
  }))
}
