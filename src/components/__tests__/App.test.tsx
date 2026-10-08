import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { AI_MIN_THINK_MS, DEFAULT_TIMERS, MOVE_TIME_MS, type GameTimers } from '../../hooks/useGame'
import { allCoords, coordKey, formatCoord } from '../../game/coordinates'
import { randomFleet, shipCells } from '../../game/placement'
import { createRng } from '../../game/rng'
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
  return screen.getByRole('region', { name: 'Game status' })
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
    expect(screen.getByText('Battleship would overlap your Carrier.', { selector: '.error-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Carrier, length 5 — Placed/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Carrier, length 5 — Placed/ }))
    await user.click(screen.getByRole('gridcell', { name: 'Your fleet, G10, empty' }))
    expect(screen.getByText('Carrier would extend off the board.', { selector: '.error-message' }))
      .toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Your fleet, A1, Carrier' })).toBeInTheDocument()
  })

  it('gates Start during manual placement and after clearing a randomized fleet', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    expect(start).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Clear board' }))
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
})
