import { useState } from 'react'
import Board from './Board'
import Legend from './Legend'
import { formatCoord, inBounds } from '../game/coordinates'
import { isCompleteValidFleet, shipCells, validatePlacement } from '../game/placement'
import { FLEET } from '../game/types'
import type { Coord, PlacedShip, ShipSpec } from '../game/types'
import { playerCellViews, type GameState } from '../game/state'
import type { PreviewCell } from './Board'
import type { GameActions } from '../hooks/useGame'
import {
  FLEET_COMPLETE_MESSAGE,
  describePlayerCell,
  forfeitMessage,
  placementErrorMessage,
  placementSuccessMessage,
  symbolForCell,
} from '../ui/messages'

interface SetupScreenProps {
  state: GameState
  actions: GameActions
}

function selectedSpec(state: GameState): ShipSpec | undefined {
  return FLEET.find((spec) => spec.id === state.setup.selectedShipId)
}

function previewDescription(
  spec: ShipSpec | undefined,
  anchor: Coord | null,
  orientation: GameState['setup']['orientation'],
  result: ReturnType<typeof validatePlacement> | null,
  complete: boolean,
): string {
  if (!spec && complete) return FLEET_COMPLETE_MESSAGE
  if (!spec || !anchor || !result) return 'Hover over or focus a cell to preview placement.'
  const prefix = `${spec.name} at ${formatCoord(anchor)}, ${orientation}: `
  if (result.ok) return `${prefix}fits`
  if (result.reason === 'out-of-bounds') return `${prefix}doesn't fit — out of bounds`
  const conflict = FLEET.find((ship) => ship.id === result.conflictingShipId)?.name
  return `${prefix}doesn't fit — overlaps ${conflict ?? 'another ship'}`
}

export default function SetupScreen({ state, actions }: SetupScreenProps) {
  const [previewAnchor, setPreviewAnchor] = useState<Coord | null>(null)
  const spec = selectedSpec(state)
  const candidate: PlacedShip | null = spec && previewAnchor
    ? { id: spec.id, origin: previewAnchor, orientation: state.setup.orientation }
    : null
  const validation = candidate ? validatePlacement(state.setup.ships, candidate) : null
  const previewCells: PreviewCell[] = candidate
    ? shipCells(candidate)
      .filter((coord) => inBounds(coord))
      .map((coord) => ({ coord, valid: validation?.ok === true }))
    : []
  const complete = isCompleteValidFleet(state.setup.ships)
  const anyPlaced = state.setup.ships.length > 0
  const errorMessage = placementErrorMessage(state.setup.error)
  const forfeitNotice = forfeitMessage(state)
  const placementMessage = placementSuccessMessage(state)

  return (
    <section className="setup-screen" aria-labelledby="setup-heading">
      <h1 id="setup-heading">Battleship</h1>
      {forfeitNotice && <p className="forfeit-message">{forfeitNotice}</p>}
      <p>Sink all five enemy ships before the AI sinks yours.</p>
      <ul className="rules-list">
        <li>Place all five ships horizontally or vertically; ships may touch.</li>
        <li>Once a ship is placed it is locked. To rearrange your fleet, choose Start over to begin a new game.</li>
        <li>Fire once per turn. After each shot, the AI replies after a short delay.</li>
      </ul>

      <section className="fleet-setup" aria-labelledby="fleet-heading">
        <h2 id="fleet-heading">Your fleet</h2>
        <ul className="fleet-list">
          {FLEET.map((ship) => {
            const placed = state.setup.ships.some((candidateShip) => candidateShip.id === ship.id)
            const selected = state.setup.selectedShipId === ship.id
            return (
              <li key={ship.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={placed}
                  onClick={() => actions.selectShip(ship.id)}
                >
                  {ship.name}, length {ship.length} — {placed ? 'Placed — locked' : 'Not placed'}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="setup-controls">
          <button type="button" onClick={actions.rotate}>
            Rotate (currently {state.setup.orientation})
          </button>
          <button type="button" onClick={actions.randomize} disabled={anyPlaced}>Randomize</button>
          <button type="button" onClick={actions.clearBoard} disabled={!anyPlaced}>Start over</button>
          <button type="button" onClick={actions.start} disabled={!complete}>Start game</button>
        </div>
      </section>

      <section className="setup-board-section" aria-labelledby="placement-heading">
        <h2 id="placement-heading">Place your fleet</h2>
        <Board
          label="Your fleet"
          cells={playerCellViews(state)}
          describeCell={describePlayerCell}
          symbolFor={symbolForCell}
          onActivate={actions.placeShip}
          canActivate={() => spec !== undefined}
          onPreview={setPreviewAnchor}
          previewCells={previewCells}
        />
        <p className="preview-message" aria-live="off">
          {previewDescription(spec, previewAnchor, state.setup.orientation, validation, complete)}
        </p>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
        {placementMessage && <p className="placement-message">{placementMessage}</p>}
        <Legend />
      </section>
    </section>
  )
}
