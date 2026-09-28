// "Juan Carlos" -> ['Juan', 'Carlos'] | "Ana" -> ['Ana', null]
export function splitFirstWord(text: string): [string, string | null] {
  const [first, ...rest] = text.trim().split(/\s+/);
  return [first, rest.length ? rest.join(' ') : null];
}