export interface Coord {
  row: number
  col: number
}

export type Orientation = 'horizontal' | 'vertical'

export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'

export interface ShipSpec {
  id: ShipId
  name: string
  length: number
}

export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
]

export interface PlacedShip {
  id: ShipId
  origin: Coord
  orientation: Orientation
}

export type ShotOutcome = 'miss' | 'hit' | 'sunk'

export interface Shot {
  coord: Coord
  outcome: ShotOutcome
  sunkShipId?: ShipId
}

export interface Board {
  ships: PlacedShip[]
  shots: Shot[]
}
