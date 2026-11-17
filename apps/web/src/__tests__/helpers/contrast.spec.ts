import { describe, expect, it } from 'vitest'
import { contrastRatio, cssValue, resolveColor } from './contrast'

describe('contrast helper', () => {
  it('computes the WCAG ratio for known pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#8a2be2', '#8a2be2')).toBe(1)
    // #767676 is the lightest grey that passes 4.5:1 on white.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it('resolves tokens, nested tokens and color-mix like the browser', () => {
    expect(resolveColor('var(--page-background)')).toEqual([2, 6, 23])
    expect(resolveColor('var(--text-on-dark)')).toEqual([248, 249, 250])
    expect(resolveColor('color-mix(in srgb, #000000 25%, #ffffff)')).toEqual([
      191.25, 191.25, 191.25,
    ])
    expect(resolveColor('color-mix(in srgb, #000000, #ffffff 25%)')).toEqual([63.75, 63.75, 63.75])
    // 85% content background + 15% surface background.
    expect(resolveColor('var(--text-on-dark-secondary)').map(Math.round)).toEqual([213, 215, 219])
  })

  it('rejects colors it cannot resolve without a backdrop', () => {
    expect(() => resolveColor('var(--overlay-background)')).toThrow('Unsupported color')
    expect(() => resolveColor('var(--does-not-exist)')).toThrow('Unknown token')
    expect(() => resolveColor('rgb(0 0 0)')).toThrow('Unsupported color')
  })

  it('reads a declaration from a component style block', () => {
    const source =
      '.a { color: red; }\n.badge.cancelled {\n  margin: 0;\n  color: var(--error-text);\n}'
    expect(cssValue(source, '.badge.cancelled', 'color')).toBe('var(--error-text)')
    expect(() => cssValue(source, '.missing', 'color')).toThrow('No rule')
    expect(() => cssValue(source, '.a', 'background')).toThrow('No background')
  })
})
