import { describe, it, expect } from 'vitest'
import { matchEntity, matchFact } from '../scoring'

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

describe('matchFact', () => {
  it('matches when source, target, and fact all match', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(true)
  })

  it('matches with entity name normalization', () => {
    const extracted = {
      fact: 'team uses PostgreSQL',
      source: 'Team',
      target: 'postgresql'
    }
    const expected = {
      fact: 'team uses PostgreSQL',
      source: 'team',
      target: 'PostgreSQL'
    }
    expect(matchFact(extracted, expected)).toBe(true)
  })

  it('does not match when source differs', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'admin',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })

  it('does not match when target differs', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'light mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })

  it('does not match when fact text differs', () => {
    const extracted = {
      fact: 'user likes dark mode',
      source: 'user',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })
})
