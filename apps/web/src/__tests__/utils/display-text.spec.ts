import { describe, expect, it } from 'vitest'
import { displayText } from '@/utils/display-text'

describe('catalog label display', () => {
  it.each([
    [' español ', 'Español'],
    ['acción', 'Acción'],
    ['ciencia ficción', 'Ciencia ficción'],
    ['IMAX', 'IMAX'],
    ['70mm', '70mm'],
    ['', ''],
    ['   ', ''],
  ])('formats %s as %s without rewriting stored identifiers or acronyms', (value, expected) => {
    expect(displayText(value)).toBe(expected)
  })
})
