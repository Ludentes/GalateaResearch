import { describe, it, expect } from 'vitest'
import { matchEntity, matchFact, calculateScores } from '../scoring'

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

describe('calculateScores', () => {
  it('calculates perfect entity scores', () => {
    const expected = {
      entities: [{ name: 'Docker' }, { name: 'user' }],
      facts: []
    }
    const extracted = {
      entities: [{ name: 'Docker' }, { name: 'user' }],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(1.0)
    expect(scores.entity_recall).toBe(1.0)
    expect(scores.entity_f1).toBe(1.0)
  })

  it('calculates partial entity scores', () => {
    const expected = {
      entities: [{ name: 'Docker' }, { name: 'Redis' }],
      facts: []
    }
    const extracted = {
      entities: [{ name: 'Docker' }, { name: 'PostgreSQL' }],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    // 1 matched out of 2 extracted = 0.5 precision
    expect(scores.entity_precision).toBe(0.5)
    // 1 matched out of 2 expected = 0.5 recall
    expect(scores.entity_recall).toBe(0.5)
    // F1 = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.5
    expect(scores.entity_f1).toBe(0.5)
  })

  it('handles zero extracted entities edge case', () => {
    const expected = {
      entities: [{ name: 'Docker' }],
      facts: []
    }
    const extracted = {
      entities: [],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(0)
    expect(scores.entity_recall).toBe(0)
    expect(scores.entity_f1).toBe(0)
  })

  it('handles zero expected entities edge case (perfect empty)', () => {
    const expected = {
      entities: [],
      facts: []
    }
    const extracted = {
      entities: [],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(1.0)
    expect(scores.entity_recall).toBe(1.0)
    expect(scores.entity_f1).toBe(1.0)
  })
})
