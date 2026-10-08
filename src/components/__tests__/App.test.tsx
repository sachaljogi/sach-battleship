import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { AI_MIN_THINK_MS, DEFAULT_TIMERS, MOVE_TIME_MS, type GameTimers } from '../../hooks/useGame'
import { STATS_STORAGE_KEY } from '../../hooks/useSessionStats'
import { allCoords, coordKey, formatCoord } from '../../game/coordinates'
import { randomFleet, shipCells } from '../../game/placement'
import { createRng, type Rng } from '../../game/rng'
import type { Coord, PlacedShip } from '../../game/types'

const DEFAULT_SEED = 7281
const AI_DELAY_MS = 1500
const TEST_TIMERS: GameTimers = { ...DEFAULT_TIMERS, aiMinThinkMs: AI_DELAY_MS, aiMaxThinkMs: AI_DELAY_MS }

function enemyFleetForSeed(seed: number): PlacedShip[] {
  const rng = createRng(seed)
  randomFleet(rng)
  return randomFleet(rng)
}

function renderApp(seed = DEFAULT_SEED, strict = false, timers = TEST_TIMERS) {
  const app = <App rng={createRng(seed)} timers={timers} />
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}

async function startGameWithRng(user: ReturnType<typeof setupUser>, rng: Rng) {
  render(<App rng={rng} timers={TEST_TIMERS} />)
  await user.click(screen.getByRole('button', { name: 'Randomize' }))
  await user.click(screen.getByRole('button', { name: 'Start game' }))
}

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

async function startRandomizedGame(
  user: ReturnType<typeof setupUser>,
  seed = DEFAULT_SEED,
  strict = false,
  timers = TEST_TIMERS,
) {
  renderApp(seed, strict, timers)
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

function statusPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Let the Games Begin!' })
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
  window.sessionStorage.clear()
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
    await advanceAI(MOVE_TIME_MS - 1)
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
    expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire')
    expect(vi.getTimerCount()).toBe(2)

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

  it('awards gold coins after a win, continues the series, and survives a reload', async () => {
    const user = setupUser()
    const enemyFleet = await startRandomizedGame(user, 91)
    const cells = enemyFleet.flatMap((ship) => shipCells(ship))
    expect(screen.getByTestId('coin-total')).toHaveTextContent('Gold coins: 0')
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 0 – AI 0, game 1 of 3')

    for (const [index, coord] of cells.entries()) {
      await user.click(enemyCell(coord))
      if (index < cells.length - 1) await advanceAI()
    }

    expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument()
    expect(screen.getByTestId('coin-total')).toHaveTextContent('Gold coins: 1')
    expect(screen.getByText('You earned 1 gold coin. Total: 1.')).toBeInTheDocument()
    expect(screen.getByText('Series: You 1 – AI 0. Next up: game 2 of 3.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You earned 1 gold coin. Total: 1.')

    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(screen.getByTestId('coin-total')).toHaveTextContent('Gold coins: 1')
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 1 – AI 0, game 2 of 3')

    cleanup()
    renderApp()
    expect(screen.getByTestId('coin-total')).toHaveTextContent('Gold coins: 1')
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 1 – AI 0, game 2 of 3')
  })

  it('counts an abandoned game as a series loss and announces it during setup', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 95)
    await user.click(enemyCell({ row: 0, col: 0 }))
    await advanceAI()
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 0 – AI 0, game 1 of 3')

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Yes, start over' }))

    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
    expect(screen.getByTestId('coin-total')).toHaveTextContent('Gold coins: 0')
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 0 – AI 1, game 2 of 3')
    const notice = 'You abandoned the last game, so it counted as a loss. Series: You 0 – AI 1. Next up: game 2 of 3.'
    expect(screen.getByText(notice, { selector: '.forfeit-message' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(`${notice} Set up your fleet.`)

    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByText('Abandon this game? It counts as a loss, and the AI will win the series.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, start over' }))
    expect(screen.getByTestId('series-score')).toHaveTextContent('Series: You 0 – AI 0, game 1 of 3')
    expect(screen.getByRole('status')).toHaveTextContent('The AI won the best-of-3 series 0–2. A new series starts now.')
  })

  it('cancels a pending AI shot on confirmed new game and starts cleanly', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 92)
    await user.click(enemyCell({ row: 0, col: 0 }))
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByText('Abandon this game? It counts as a loss in the series.')).toBeInTheDocument()
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

  it('fires exactly one AI shot and one timed-out player shot in Strict Mode', async () => {
    const user = setupUser()
    await startRandomizedGame(user, 94, true)
    const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })
    const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
    await user.click(enemyCell({ row: 0, col: 0 }))
    await advanceAI()
    expect(countShots(playerGrid)).toBe(1)
    expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire5')

    await advanceAI(MOVE_TIME_MS)
    expect(countShots(enemyGrid)).toBe(2)
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    await advanceAI()
    expect(countShots(playerGrid)).toBe(2)
    expect(countShots(enemyGrid)).toBe(2)
  })

  describe('move timer', () => {
    it('counts down and fires automatically when the player runs out of time', async () => {
      const user = setupUser()
      await startRandomizedGame(user)
      const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
      const timer = screen.getByRole('timer')
      expect(timer).toHaveTextContent('Seconds left to fire5')
      expect(timer).toHaveAttribute('data-urgent', 'false')
      expect(screen.getByRole('status')).toHaveTextContent('Your turn — fire on Enemy waters')

      await advanceAI(2000)
      expect(timer).toHaveTextContent('Seconds left to fire3')
      expect(timer).toHaveAttribute('data-urgent', 'true')
      expect(screen.getByRole('status')).toHaveTextContent('3 seconds left.')
      await advanceAI(2000)
      expect(timer).toHaveTextContent('Seconds left to fire1')
      expect(screen.getByRole('status')).toHaveTextContent('1 second left.')
      await advanceAI(999)
      expect(countShots(enemyGrid)).toBe(0)

      await advanceAI(1)
      expect(countShots(enemyGrid)).toBe(1)
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
      expect(within(statusPanel()).getByText(/^Time ran out, so a shot was fired for you at [A-J](?:10|[1-9]):/))
        .toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Time ran out, so a shot was fired for you at')
      expect(screen.getByRole('timer')).toHaveTextContent(`AI fires in${Math.ceil(AI_DELAY_MS / 1000)}`)

      await advanceAI()
      expect(countShots(screen.getByRole('grid', { name: 'Your fleet' }))).toBe(1)
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire5')
      await user.click(enemyCell({ row: 9, col: 9 }))
      expect(within(statusPanel()).getByText(/^You fired at J10:/)).toBeInTheDocument()
    })

    it('does not fire twice when the player fires just before the deadline', async () => {
      const user = setupUser()
      await startRandomizedGame(user)
      const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
      const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })

      await advanceAI(4900)
      await user.click(enemyCell({ row: 0, col: 0 }))
      expect(countShots(enemyGrid)).toBe(1)
      await advanceAI(200)
      expect(countShots(enemyGrid)).toBe(1)
      expect(countShots(playerGrid)).toBe(0)
      await advanceAI(AI_DELAY_MS - 200)
      expect(countShots(playerGrid)).toBe(1)
      expect(countShots(enemyGrid)).toBe(1)
      expect(within(statusPanel()).getByText(/^You fired at A1:/)).toBeInTheDocument()
    })

    it('pauses the countdown while the abandon confirmation is open and resumes on Keep playing', async () => {
      const user = setupUser()
      await startRandomizedGame(user)
      const enemyGrid = screen.getByRole('grid', { name: 'Enemy waters' })
      await advanceAI(2000)
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire3')

      await user.click(screen.getByRole('button', { name: 'New game' }))
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to firepaused')
      expect(vi.getTimerCount()).toBe(0)
      await advanceAI(MOVE_TIME_MS * 2)
      expect(countShots(enemyGrid)).toBe(0)
      expect(screen.getByRole('status')).not.toHaveTextContent('seconds left')

      await user.click(screen.getByRole('button', { name: 'Keep playing' }))
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire3')
      await advanceAI(2999)
      expect(countShots(enemyGrid)).toBe(0)
      await advanceAI(1)
      expect(countShots(enemyGrid)).toBe(1)
    })

    it('lets the AI reply within the 5 second budget using the default timers', async () => {
      const user = setupUser()
      await startRandomizedGame(user, DEFAULT_SEED, false, DEFAULT_TIMERS)
      const playerGrid = screen.getByRole('grid', { name: 'Your fleet' })
      await user.click(enemyCell({ row: 0, col: 0 }))
      expect(screen.getByRole('timer')).toHaveTextContent(/^AI fires in[1-5]$/)

      await advanceAI(AI_MIN_THINK_MS - 1)
      expect(countShots(playerGrid)).toBe(0)
      await advanceAI(MOVE_TIME_MS - AI_MIN_THINK_MS + 1)
      expect(countShots(playerGrid)).toBe(1)
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire5')
    })

    it('clears the player timer on confirmed new game and on unmount', async () => {
      const user = setupUser()
      await startRandomizedGame(user)
      await advanceAI(1000)
      expect(vi.getTimerCount()).toBeGreaterThan(0)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: 'Yes, start over' }))
      expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
      expect(screen.queryByRole('timer')).not.toBeInTheDocument()
      expect(vi.getTimerCount()).toBe(0)

      await user.click(screen.getByRole('button', { name: 'Randomize' }))
      await user.click(screen.getByRole('button', { name: 'Start game' }))
      expect(screen.getByRole('timer')).toHaveTextContent('Seconds left to fire5')
      await advanceAI(MOVE_TIME_MS - 1)
      expect(countShots(screen.getByRole('grid', { name: 'Enemy waters' }))).toBe(0)
      cleanup()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops all timers when the game ends', async () => {
      const user = setupUser()
      const enemyFleet = await startRandomizedGame(user, 91)
      const cells = enemyFleet.flatMap((ship) => shipCells(ship))
      for (const [index, coord] of cells.entries()) {
        await user.click(enemyCell(coord))
        if (index < cells.length - 1) await advanceAI()
      }
      expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument()
      expect(screen.queryByRole('timer')).not.toBeInTheDocument()
      expect(vi.getTimerCount()).toBe(0)
    })
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

  it('records a finished game once in the session leaderboard and announces the promotion', async () => {
    const user = setupUser()
    const enemyFleet = await startRandomizedGame(user, 91, true)
    const leaderboard = screen.getByRole('region', { name: 'Session leaderboard' })
    expect(within(leaderboard).getByText('Recruit')).toBeInTheDocument()
    expect(within(leaderboard).getByText('0–0')).toBeInTheDocument()
    expect(within(leaderboard).queryByRole('table')).toBeNull()

    const cells = enemyFleet.flatMap((ship) => shipCells(ship))
    for (const [index, coord] of cells.entries()) {
      await user.click(enemyCell(coord))
      if (index < cells.length - 1) await advanceAI()
    }
    expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument()

    expect(within(leaderboard).getByText('Ensign')).toBeInTheDocument()
    expect(within(leaderboard).getByText('1–0')).toBeInTheDocument()
    expect(within(leaderboard).getByText(`${cells.length} shots`)).toBeInTheDocument()
    expect(within(leaderboard).getByText('Promoted to Ensign!')).toBeInTheDocument()
    expect(screen.getByTestId('rank-announcement')).toHaveTextContent('Promoted to Ensign!')
    const table = within(leaderboard).getByRole('table', { name: 'Most recent games' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Game', 'Winner', 'Your shots', 'AI shots'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent(`1You${cells.length}${cells.length - 1}`)

    await advanceAI(5000)
    expect(within(leaderboard).getByText('1–0')).toBeInTheDocument()
    const saved = JSON.parse(window.sessionStorage.getItem(STATS_STORAGE_KEY)!)
    expect(saved).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, streak: 1, bestWinShots: cells.length })

    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(within(leaderboard).getByText('1–0')).toBeInTheDocument()
    expect(screen.getByTestId('rank-announcement')).toHaveTextContent('')
    expect(within(leaderboard).getByText('2 more wins to reach Captain.')).toBeInTheDocument()
  })

  it('restores the leaderboard from sessionStorage on reload', async () => {
    window.sessionStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({
      gamesPlayed: 3,
      wins: 1,
      losses: 2,
      streak: 0,
      bestWinShots: 35,
      lastRankUp: { game: 1, rank: 'Ensign' },
      games: [
        { game: 1, matchId: 1, winner: 'player', playerShots: 35, aiShots: 30 },
        { game: 2, matchId: 2, winner: 'ai', playerShots: 50, aiShots: 51 },
        { game: 3, matchId: 3, winner: 'ai', playerShots: 44, aiShots: 45 },
      ],
    }))
    renderApp()
    const leaderboard = screen.getByRole('region', { name: 'Session leaderboard' })
    expect(within(leaderboard).getByText('Ensign')).toBeInTheDocument()
    expect(within(leaderboard).getByText('1–2')).toBeInTheDocument()
    expect(within(leaderboard).getByText('35 shots')).toBeInTheDocument()
    expect(within(leaderboard).queryByText('Promoted to Ensign!')).toBeNull()
    const rows = within(within(leaderboard).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual(['3AI4445', '2AI5051', '1You3530'])
  })
})
