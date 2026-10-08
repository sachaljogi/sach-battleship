import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { AI_DELAY_MS } from '../../hooks/useGame'
import { STATS_STORAGE_KEY } from '../../hooks/useSessionStats'
import { allCoords, coordKey, formatCoord } from '../../game/coordinates'
import { randomFleet, shipCells } from '../../game/placement'
import { createRng } from '../../game/rng'
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
    await advanceAI(5000)
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
