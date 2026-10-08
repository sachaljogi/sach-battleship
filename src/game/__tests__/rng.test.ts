import { describe, expect, it } from 'vitest'
import { createRng, pick, randomInt, shuffle } from '../rng'

const degenerateRngs: [string, () => number][] = [
  ['() => 1', () => 1],
  ['() => NaN', () => Number.NaN],
  ['() => 2.5', () => 2.5],
  ['() => -1', () => -1],
  ['() => Infinity', () => Number.POSITIVE_INFINITY],
]

describe('rng contract', () => {
  it('createRng stays within [0, 1) and is reproducible', () => {
    const left = createRng(42)
    const right = createRng(42)
    for (let index = 0; index < 1000; index += 1) {
      const value = left()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(right()).toBe(value)
    }
  })

  it('randomInt rejects a non-positive or fractional count', () => {
    expect(() => randomInt(() => 0.5, 0)).toThrow(RangeError)
    expect(() => randomInt(() => 0.5, 1.5)).toThrow(RangeError)
  })

  it.each(degenerateRngs)('randomInt clamps %s into range', (_label, rng) => {
    for (let n = 1; n <= 10; n += 1) {
      const value = randomInt(rng, n)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(n)
    }
  })

  it.each(degenerateRngs)('shuffle with %s returns a permutation without holes', (_label, rng) => {
    const result = shuffle(rng, [1, 2, 3])
    expect(result).toHaveLength(3)
    expect([...result].sort()).toEqual([1, 2, 3])
    expect(Object.keys(result)).toEqual(['0', '1', '2'])
  })

  it.each(degenerateRngs)('pick with %s always returns an element', (_label, rng) => {
    expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']))
    expect(pick(rng, [])).toBeUndefined()
  })
})
