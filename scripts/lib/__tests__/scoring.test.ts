import { describe, it, expect } from 'vitest'
import { matchEntity } from '../scoring'

describe('matchEntity', () => {
  it('matches identical entities', () => {
    expect(matchEntity('Docker', 'Docker')).toBe(true)
  })

  it('matches case-insensitive', () => {
    expect(matchEntity('Docker', 'docker')).toBe(true)
    expect(matchEntity('POSTGRESQL', 'PostgreSQL')).toBe(true)
  })

  it('matches after whitespace normalization', () => {
    expect(matchEntity('dark  mode', 'dark mode')).toBe(true)
    expect(matchEntity('  React Native  ', 'React Native')).toBe(true)
  })

  it('does not match different entities', () => {
    expect(matchEntity('Docker', 'Redis')).toBe(false)
  })
})
