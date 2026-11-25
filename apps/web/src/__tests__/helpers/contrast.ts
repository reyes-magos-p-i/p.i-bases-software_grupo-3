// WCAG 2.x contrast checks against the real design tokens in variables.css.
// jsdom does not apply component styles, so tests read the color a component
// declares (cssValue) and resolve it here (var() and color-mix included).
// Read from disk: Vitest does not process CSS, so a ?raw import of a .css file is empty.
// The path is relative to apps/web, the Vitest root (jsdom gives import.meta.url an http scheme).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/variables.css'), 'utf8')

type Rgb = [number, number, number]

function declarations(css: string) {
  const values = new Map<string, string>()
  // Each declaration ends with ";", so its name is the first "--" of the chunk before it.
  for (const chunk of css.split(';')) {
    const start = chunk.indexOf('--')
    const colon = chunk.indexOf(':', start)
    if (start < 0 || colon < 0) continue
    const name = chunk.slice(start, colon).trim()
    if (!/^--[\w-]+$/.test(name)) continue
    // Multi-line color-mix() declarations are folded to "color-mix(in srgb, a 85%, b)".
    const value = chunk.slice(colon + 1).replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')')
    values.set(name, value.trim())
  }
  return values
}

const tokens = declarations(tokensCss)

// Splits on commas that are not inside parentheses.
function topLevelArgs(value: string) {
  const args: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) {
      args.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  args.push(value.slice(start).trim())
  return args
}

// "a 85%" -> color "a", weight 0.85. The weight is the last word, so the part is
// split on whitespace instead of a regex like /^(.*\S)\s+([\d.]+)%$/, which backtracks.
function mixPart(part: string) {
  const words = part.split(/\s+/)
  const last = words.pop()!
  if (words.length === 0 || !/^[\d.]+%$/.test(last)) return { color: part }
  return { color: words.join(' '), weight: Number(last.slice(0, -1)) / 100 }
}

/** Resolves a CSS color (hex, var(--token) or color-mix in srgb) to sRGB channels. */
export function resolveColor(value: string): Rgb {
  const color = value.trim()
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d).join('') : hex[1]!
    return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as Rgb
  }
  const variable = /^var\((--[\w-]+)\)$/.exec(color)
  if (variable) {
    const token = tokens.get(variable[1]!)
    if (!token) throw new Error(`Unknown token ${variable[1]}`)
    return resolveColor(token)
  }
  const mix = /^color-mix\(in srgb,(.*)\)$/.exec(color)
  if (mix) {
    const [first, second] = topLevelArgs(mix[1]!).map(mixPart)
    if (!first || !second) throw new Error(`Unsupported color-mix: ${color}`)
    const a = first.weight ?? 1 - (second.weight ?? 0.5)
    const b = second.weight ?? 1 - a
    const [ca, cb] = [resolveColor(first.color), resolveColor(second.color)]
    return ca.map((channel, i) => (channel * a + cb[i]! * b) / (a + b)) as Rgb
  }
  // transparent and other alpha values would need the color underneath.
  throw new Error(`Unsupported color: ${color}`)
}

function luminance([r, g, b]: Rgb) {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two CSS colors, from 1 to 21. */
export function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [
    luminance(resolveColor(foreground)),
    luminance(resolveColor(background)),
  ].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Value of a property inside the first rule for a selector in a component's source. */
export function cssValue(source: string, selector: string, property: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const rule = new RegExp(String.raw`(?:^|[},\s])${escaped}\s*\{([^}]*)\}`).exec(source)
  if (!rule) throw new Error(`No rule for ${selector}`)
  const value = new RegExp(String.raw`(?:^|;|\s)${property}\s*:([^;]+);`).exec(rule[1]!)
  if (!value) throw new Error(`No ${property} in ${selector}`)
  return value[1]!.trim()
}
