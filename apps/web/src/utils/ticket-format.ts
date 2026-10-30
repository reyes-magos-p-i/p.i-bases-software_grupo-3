/** "2026/10/10 18:00" -> "10/10/2026, 18:00" */
export function formatTicketDate(value: string) {
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}, ${match[4]}` : value
}
