export type Rng = () => number

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError('n must be a positive integer')
  }
  const value = rng()
  if (Number.isNaN(value)) return 0
  return Math.min(n - 1, Math.max(0, Math.floor(value * n)))
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const result = [...arr]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, index + 1)
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

export function pick<T>(rng: Rng, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[randomInt(rng, arr.length)]
}
