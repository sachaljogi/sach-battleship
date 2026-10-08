import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { COLUMN_LABELS, coordKey, formatCoord } from '../game/coordinates'
import type { Coord } from '../game/types'
import type { CellView, PlayerCellView } from '../game/state'

export interface PreviewCell {
  coord: Coord
  valid: boolean
}

interface BoardProps<Cell extends CellView | PlayerCellView> {
  label: 'Your fleet' | 'Enemy waters'
  cells: readonly Cell[][]
  describeCell: (coord: Coord, cell: Cell) => string
  symbolFor: (cell: Cell) => string
  onActivate: (coord: Coord) => void
  canActivate: (coord: Coord) => boolean
  onPreview?: (coord: Coord | null) => void
  previewCells?: readonly PreviewCell[]
}

export default function Board<Cell extends CellView | PlayerCellView>({
  label,
  cells,
  describeCell,
  symbolFor,
  onActivate,
  canActivate,
  onPreview,
  previewCells = [],
}: BoardProps<Cell>) {
  const [activeCoord, setActiveCoord] = useState<Coord>({ row: 0, col: 0 })
  const [focusedCoord, setFocusedCoord] = useState<Coord | null>(null)
  const [hoveredCoord, setHoveredCoord] = useState<Coord | null>(null)
  // True only while focus was reached by keyboard (Tab or arrow keys), never by a pointer click.
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const pointerDownRef = useRef(false)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const previews = new Map(previewCells.map((preview) => [coordKey(preview.coord), preview.valid]))

  // The preview anchor is derived here, in one place, so no handler can restore a stale value.
  const previewAnchor = useMemo(
    () => hoveredCoord ?? (keyboardFocus ? focusedCoord : null),
    [hoveredCoord, keyboardFocus, focusedCoord],
  )
  useEffect(() => {
    onPreview?.(previewAnchor)
  }, [onPreview, previewAnchor])

  function moveFocus(coord: Coord) {
    setActiveCoord(coord)
    cellRefs.current.get(coordKey(coord))?.focus()
  }

  function activate(coord: Coord) {
    if (!canActivate(coord)) return
    // Hide the preview until the next real hover or keyboard move so the result of the
    // activation is not immediately covered by a preview anchored to the same cell.
    setHoveredCoord(null)
    setKeyboardFocus(false)
    onActivate(coord)
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, coord: Coord) {
    setKeyboardFocus(true)
    let next: Coord
    if (event.key === 'ArrowUp') next = { ...coord, row: Math.max(0, coord.row - 1) }
    else if (event.key === 'ArrowDown') next = { ...coord, row: Math.min(cells.length - 1, coord.row + 1) }
    else if (event.key === 'ArrowLeft') next = { ...coord, col: Math.max(0, coord.col - 1) }
    else if (event.key === 'ArrowRight') {
      next = { ...coord, col: Math.min((cells[coord.row]?.length ?? 1) - 1, coord.col + 1) }
    } else return
    event.preventDefault()
    moveFocus(next)
  }

  return (
    <div className="board-scroll">
      <div role="grid" aria-label={label} aria-rowcount={cells.length + 1} aria-colcount={COLUMN_LABELS.length + 1}
        className="board-grid">
        <div role="row" className="board-row board-column-labels">
          <span role="columnheader" aria-label="Row numbers" className="board-header board-corner" />
          {COLUMN_LABELS.split('').map((column) => (
            <span role="columnheader" key={column} className="board-header">{column}</span>
          ))}
        </div>
        {cells.map((row, rowIndex) => (
          <div role="row" key={rowIndex} className="board-row">
            <span role="rowheader" className="board-header">{rowIndex + 1}</span>
            {row.map((cell, colIndex) => {
              const coord = { row: rowIndex, col: colIndex }
              const key = coordKey(coord)
              const preview = previews.get(key)
              const canFire = canActivate(coord)
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={key}
                  ref={(element) => {
                    if (element) cellRefs.current.set(key, element)
                    else cellRefs.current.delete(key)
                  }}
                  tabIndex={coord.row === activeCoord.row && coord.col === activeCoord.col ? 0 : -1}
                  aria-label={describeCell(coord, cell)}
                  aria-disabled={!canFire}
                  data-state={cell.state}
                  className={[
                    'board-cell',
                    `state-${cell.state}`,
                    preview === undefined ? '' : `preview-${preview ? 'valid' : 'invalid'}`,
                  ].filter(Boolean).join(' ')}
                  onPointerDown={() => {
                    pointerDownRef.current = true
                  }}
                  onClick={() => {
                    pointerDownRef.current = false
                    activate(coord)
                  }}
                  onKeyDown={(event) => onCellKeyDown(event, coord)}
                  onFocus={() => {
                    setActiveCoord(coord)
                    setFocusedCoord(coord)
                    setKeyboardFocus(!pointerDownRef.current)
                  }}
                  onBlur={() => {
                    setFocusedCoord(null)
                    setKeyboardFocus(false)
                  }}
                  onMouseEnter={() => setHoveredCoord(coord)}
                  onMouseMove={() => setHoveredCoord((current) => current ?? coord)}
                  onMouseLeave={() => setHoveredCoord(null)}
                >
                  <span aria-hidden="true">{preview === undefined ? symbolFor(cell) : preview ? '✓' : '✕'}</span>
                  <span className="visually-hidden">{formatCoord(coord)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
