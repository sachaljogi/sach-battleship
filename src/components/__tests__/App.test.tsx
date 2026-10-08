import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { AI_DELAY_MS } from '../../hooks/useGame'
import { allCoords, coordKey, formatCoord } from '../../game/coordinates'
import { randomFleet, shipCells } from '../../game/placement'
import { createRng, type Rng } from '../../game/rng'
import type { Coord, PlacedShip } from '../../game/types'

const DEFAULT_SEED = 7281

function enemyFleetForSeed(seed: number): PlacedShip[] {
  const rng = createRng(seed)
  randomFleet(rng)
  return randomFleet(rng)
}

function renderApp(seed = DEFAULT_SEED, strict = false) {
  const app = <App rng={createRng(seed)} />
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}

async function startGameWithRng(user: ReturnType<typeof setupUser>, rng: Rng) {
  render(<App rng={rng} />)
  await user.click(screen.getByRole('button', { name: 'Randomize' }))
  await user.click(screen.getByRole('button', { name: 'Start game' }))
}

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

async function startRandomizedGame(user: ReturnType<typeof setupUser>, seed = DEFAULT_SEED, strict = false) {
  renderApp(seed, strict)
  await user.click(screen.getByRole('button', { name: 'Randomize' }))
  await user.click(screen.getByRole('button', { name: 'Start game' }))
  return enemyFleetForSeed(seed)
}

function enemyCell(coord: Coord): HTMLElement {
  const grid = screen.getByRole('grid', { name: 'Enemy waters' })
  return within(grid).getByRole('gridcell', {
    name: `Enemy waters, ${formatCoord(coord)}, untried`,
  })
}

function countShots(grid: HTMLElement): number {
  return grid.querySelectorAll('[data-state="miss"], [data-state="hit"], [data-state="sunk"]').length
}

function boardSnapshot(grid: HTMLElement): string {
  return Array.from(grid.querySelectorAll('[role="gridcell"]'))
    .map((cell) => cell.getAttribute('data-state'))
    .join(',')
}

function normalizedAttributes(cell: Element): readonly (readonly [string, string])[] {
  return Array.from(cell.attributes)
    .map((attribute) => [
      attribute.name,
      attribute.name === 'aria-label'
        ? attribute.value.replace(/, [A-J](?:10|[1-9]),/, ', COORD,')
        : attribute.value,
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right))
}

async function advanceAI(ms = AI_DELAY_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('jest', vi)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  expect(console.error).not.toHaveBeenCalled()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Battleship screens', () => {
  it('shows exact overlap and out-of-bounds errors without removing placed ships', async () => {
    const user = setupUser()
    renderApp()

    const firstCell = screen.getByRole('gridcell', { name: 'Your fleet, A1, empty' })
    await user.click(firstCell)
    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' }))
    expect(screen.getByText('Battleship would overlap your Carrier at A1.', { selector: '.error-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Carrier, length 5 — Placed/ })).toBeInTheDocument()

    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, H10, empty' }))
    expect(screen.getByText('Battleship would extend off the board at H10.', { selector: '.error-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' })).toBeInTheDocument()
  })

  it('clears the placement preview after a click and only follows keyboard focus when navigating by keyboard', async () => {
    const user = setupUser()
    renderApp()
    const fleetGrid = screen.getByRole('grid', { name: 'Your fleet' })
    const previewMessage = document.querySelector('.preview-message')!
    const idleMessage = 'Hover over or focus a cell to preview placement.'
    const fleetCell = (label: string) =>
      within(fleetGrid).getByRole('gridcell', { name: new RegExp(`^Your fleet, ${label},`) })
    const previewedCells = () => fleetGrid.querySelectorAll('.preview-valid, .preview-invalid')

    expect(previewMessage).toHaveTextContent(idleMessage)
    await user.hover(fleetCell('A1'))
    expect(previewMessage).toHaveTextContent('Carrier at A1, horizontal: fits')
    expect(fleetGrid.querySelectorAll('.preview-valid')).toHaveLength(5)
    expect(fleetCell('E1')).toHaveClass('preview-valid')

    // Clicking focuses the button in Chromium/Firefox; the preview must not stick to that cell.
    await user.click(fleetCell('A1'))
    expect(fleetCell('A1')).toHaveFocus()
    expect(previewMessage).toHaveTextContent(idleMessage)
    expect(previewedCells()).toHaveLength(0)
    await user.unhover(fleetCell('A1'))
    expect(previewMessage).toHaveTextContent(idleMessage)
    expect(previewedCells()).toHaveLength(0)

    // A genuine hover over the placed ship previews the next ship honestly.
    await user.hover(fleetCell('B1'))
    expect(previewMessage).toHaveTextContent('Battleship at B1, horizontal: doesn\'t fit — overlaps Carrier')
    expect(fleetCell('B1')).toHaveClass('preview-invalid')
    await user.unhover(fleetCell('B1'))
    expect(previewMessage).toHaveTextContent(idleMessage)
    expect(previewedCells()).toHaveLength(0)

    // Keyboard focus previews, and survives the mouse leaving the board.
    await user.hover(fleetCell('A3'))
    await user.keyboard('{ArrowDown}')
    expect(fleetCell('A2')).toHaveFocus()
    await user.unhover(fleetCell('A3'))
    expect(previewMessage).toHaveTextContent('Battleship at A2, horizontal: fits')
    expect(fleetGrid.querySelectorAll('.preview-valid')).toHaveLength(4)
    await user.hover(fleetCell('A4'))
    expect(previewMessage).toHaveTextContent('Battleship at A4, horizontal: fits')
    await user.unhover(fleetCell('A4'))
    expect(previewMessage).toHaveTextContent('Battleship at A2, horizontal: fits')
    await user.keyboard('{ArrowRight}')
    expect(previewMessage).toHaveTextContent('Battleship at B2, horizontal: fits')

    // Placing with Enter clears the preview; the next arrow move shows it again.
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /Battleship, length 4 — Placed/ })).toBeInTheDocument()
    expect(fleetCell('B2')).toHaveFocus()
    expect(previewMessage).toHaveTextContent(idleMessage)
    expect(previewedCells()).toHaveLength(0)
    await user.keyboard('{ArrowDown}')
    expect(previewMessage).toHaveTextContent('Cruiser at B3, horizontal: fits')
    await user.tab()
    expect(fleetGrid.contains(document.activeElement)).toBe(false)
    expect(previewMessage).toHaveTextContent(idleMessage)
    expect(previewedCells()).toHaveLength(0)
  })

  it('announces successful placements and does not ask to select a ship once the fleet is complete', async () => {
    const user = setupUser()
    renderApp()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Set up your fleet.')

    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, A1, empty' }))
    expect(status).toHaveTextContent('Carrier placed at A1. Next: Battleship.')
    expect(screen.getByText('Carrier placed at A1. Next: Battleship.', { selector: '.placement-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A2, empty' })).toHaveAttribute('aria-disabled', 'false')

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    expect(status).toHaveTextContent('All ships are placed. Press Start game to begin.')
    const fleetGrid = screen.getByRole('grid', { name: 'Your fleet' })
    const cells = fleetGrid.querySelectorAll('[role="gridcell"]')
    expect(cells).toHaveLength(100)
    cells.forEach((cell) => expect(cell).toHaveAttribute('aria-disabled', 'true'))
    const shipsBefore = boardSnapshot(fleetGrid)

    await user.click(cells[0]!)
    await user.click(cells[99]!)
    expect(boardSnapshot(fleetGrid)).toBe(shipsBefore)
    expect(status).toHaveTextContent('All ships are placed. Press Start game to begin.')
    expect(status).not.toHaveTextContent('Select a ship')
    expect(screen.queryByText('Select a ship before placing it.')).not.toBeInTheDocument()
    expect(screen.getByText('All ships are placed. Press Start game to begin.', { selector: '.preview-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
  })

  it('locks placed ships and only Start over can change the fleet', async () => {
    const user = setupUser()
    renderApp()
    const randomize = screen.getByRole('button', { name: 'Randomize' })
    const startOver = screen.getByRole('button', { name: 'Start over' })
    expect(randomize).toBeEnabled()
    expect(startOver).toBeDisabled()
    expect(screen.getByText(/Once a ship is placed it is locked/)).toBeInTheDocument()

    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, A1, empty' }))
    const carrier = screen.getByRole('button', { name: 'Carrier, length 5 — Placed — locked' })
    expect(carrier).toBeDisabled()
    expect(carrier).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Battleship, length 4 — Not placed' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(randomize).toBeDisabled()
    expect(startOver).toBeEnabled()

    await user.click(carrier)
    expect(screen.getByRole('button', { name: 'Battleship, length 4 — Not placed' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/already placed/, { selector: '.error-message' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, A3, empty' }))
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' })).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A3, Battleship' })).toBeInTheDocument()

    await user.click(startOver)
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, empty' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carrier, length 5 — Not placed' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Randomize' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start over' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
  })

  it('gates Start during manual placement and after starting over from a randomized fleet', async () => {
    const user = setupUser()
    renderApp()
    const start = screen.getByRole('button', { name: 'Start game' })
    expect(start).toBeDisabled()

    const placements: Coord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
      { row: 4, col: 0 },
    ]
    for (const coord of placements) {
      await user.click(screen.getByRole('gridcell', {
        name: `Your fleet, ${formatCoord(coord)}, empty`,
      }))
    }
    expect(start).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Randomize' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(start).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    expect(start).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(start).toBeDisabled()
  })

  it('accepts only one rapid player shot and schedules one delayed AI reply', async () => {
    const user = setupUser()
    await startRandomizedGame(user)
    const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
    const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })

    await user.dblClick(enemyCell({ row: 0, col: 0 }))
    await user.click(enemyGrid.querySelector('[role="gridcell"][aria-label^="Enemy waters, B1"]')!)
    await user.click(enemyGrid.querySelector('[role="gridcell"][aria-label^="Enemy waters, C1"]')!)
    expect(countShots(enemyGrid)).toBe(1)
    expect(countShots(playerGrid)).toBe(0)
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('AI is thinking...')

    await advanceAI(AI_DELAY_MS - 1)
    expect(countShots(playerGrid)).toBe(0)
    await advanceAI(1)
    expect(countShots(playerGrid)).toBe(1)
    const aiBoardBefore = boardSnapshot(playerGrid)
    await advanceAI(5000)
    expect(boardSnapshot(playerGrid)).toBe(aiBoardBefore)
    expect(countShots(enemyGrid)).toBe(1)
  })

  it.each([
    ['() => 1', () => 1],
    ['() => NaN', () => Number.NaN],
  ])('clears "AI is thinking..." with the degenerate rng %s', async (_label, rng) => {
    const user = setupUser()
    await startGameWithRng(user, rng)
    const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })

    await user.click(enemyCell({ row: 0, col: 0 }))
    expect(screen.getByRole('status')).toHaveTextContent('AI is thinking...')
    await advanceAI()
    expect(screen.queryByText('AI is thinking...')).not.toBeInTheDocument()
    expect(countShots(playerGrid)).toBe(1)
    expect(vi.getTimerCount()).toBe(0)

    await user.click(enemyCell({ row: 0, col: 1 }))
    await advanceAI()
    expect(screen.queryByText('AI is thinking...')).not.toBeInTheDocument()
    expect(countShots(playerGrid)).toBe(2)
  })

  it('does not let the AI reply to a winning player shot', async () => {
    const user = setupUser()
    const enemyFleet = await startRandomizedGame(user, 91)
    const cells = enemyFleet.flatMap((ship) => shipCells(ship))
    const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })

    for (const [index, coord] of cells.entries()) {
      await user.click(enemyCell(coord))
      if (index < cells.length - 1) await advanceAI()
    }

    expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument()
    const boardBefore = boardSnapshot(playerGrid)
    await advanceAI(5000)
    expect(boardSnapshot(playerGrid)).toBe(boardBefore)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending AI shot on confirmed new game and starts cleanly', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 92)
    await user.click(enemyCell({ row: 0, col: 0 }))
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByText('Abandon this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, start over' }))
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
    expect(vi.getTimerCount()).toBe(0)

    await advanceAI(5000)
    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(countShots(screen.getByRole('grid', { name: 'Your fleet' }))).toBe(0)
  })

  it('clears the delayed AI timer when unmounted during aiTurn', async () => {
    const user = setupUser()
    renderApp(93)
    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(enemyCell({ row: 0, col: 0 }))

    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fires exactly one AI shot in Strict Mode', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 94, true)
    const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })
    await user.click(enemyCell({ row: 0, col: 0 }))
    await advanceAI()
    expect(countShots(playerGrid)).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps hidden enemy data out of the grid until a ship is sunk', async () => {
    const user = setupUser()
    const seed = 95
    const enemyFleet = await startRandomizedGame(user, seed)
    const carrier = enemyFleet.find((ship) => ship.id === 'carrier')!
    const carrierCells = shipCells(carrier)
    const hiddenCoord = carrierCells.find((coord) => coord.row !== 0 || coord.col !== 0)!
    const shipCoordinates = new Set(enemyFleet.flatMap((ship) => shipCells(ship)).map(coordKey))
    const emptyCoord = allCoords().find((coord) => (
      !shipCoordinates.has(coordKey(coord)) && (coord.row !== 0 || coord.col !== 0)
    ))!
    const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
    const hiddenCell = within(enemyGrid).getByRole('gridcell', {
      name: `Enemy waters, ${formatCoord(hiddenCoord)}, untried`,
    })
    const emptyCell = within(enemyGrid).getByRole('gridcell', {
      name: `Enemy waters, ${formatCoord(emptyCoord)}, untried`,
    })

    expect(normalizedAttributes(hiddenCell)).toEqual(normalizedAttributes(emptyCell))
    expect(enemyGrid.outerHTML.toLowerCase()).not.toMatch(/carrier|battleship|cruiser|submarine|destroyer/)

    await user.click(enemyCell(carrierCells[0]!))
    expect(enemyGrid.outerHTML.toLowerCase()).not.toMatch(/carrier|battleship|cruiser|submarine|destroyer/)
    await advanceAI()

    for (const [index, coord] of carrierCells.entries()) {
      if (index === 0) continue
      await user.click(enemyCell(coord))
      if (index < carrierCells.length - 1) await advanceAI()
    }

    const sunkGrid = enemyGrid.outerHTML.toLowerCase()
    expect(sunkGrid).toContain('carrier')
    expect(sunkGrid).not.toMatch(/battleship|cruiser|submarine|destroyer/)
  })

  it('supports roving keyboard focus, firing with Enter, and tabbing out of the board', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 96)
    const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
    const firstCell = within(enemyGrid).getByRole('gridcell', {
      name: 'Enemy waters, A1, untried',
    })
    for (let attempt = 0; attempt < 12 && document.activeElement !== firstCell; attempt += 1) {
      await user.tab()
    }
    expect(firstCell).toHaveFocus()
    expect(enemyGrid.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1)

    await user.keyboard('{ArrowRight}')
    expect(within(enemyGrid).getByRole('gridcell', { name: 'Enemy waters, B1, untried' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const target = within(enemyGrid).getByRole('gridcell', { name: 'Enemy waters, B2, untried' })
    expect(target).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('AI is thinking...')
    await user.tab()
    expect(enemyGrid.contains(document.activeElement)).toBe(false)
    await advanceAI()
  })

  it('reveals remaining enemy ships after an AI win and Play again restores clean setup', async () => {
    const user = setupUser()
    const seed = 97
    const enemyFleet = await startRandomizedGame(user, seed)
    const reservedCells = new Set(enemyFleet.map((ship) => coordKey(shipCells(ship).at(-1)!)))
    const safeShots = allCoords().filter((coord) => !reservedCells.has(coordKey(coord)))

    for (const coord of safeShots) {
      if (screen.queryByRole('heading', { name: 'The AI wins.' })) break
      await user.click(enemyCell(coord))
      await advanceAI()
    }

    expect(screen.getByRole('heading', { name: 'The AI wins.' })).toBeInTheDocument()
    const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
    expect(enemyGrid.querySelectorAll('[data-state="unhit-ship"]').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Play again' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Play again' }))

    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Carrier, length 5 — Not placed/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Set up your fleet.')
    expect(screen.getByRole('status')).not.toHaveTextContent('The AI wins.')
  }, 30000)
})
