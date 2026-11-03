/** Format catalog labels without changing stored values or acronyms. */
export function displayText(value: string): string {
  return value.trim().replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('es'))
}
