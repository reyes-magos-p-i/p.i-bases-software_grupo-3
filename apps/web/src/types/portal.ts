// SCRUM-437: portal sections. Each movie appears in exactly one (docs/portal-sections.md).
export const PORTAL_SECTIONS = ['cartelera', 'preventas', 'estrenos'] as const
export type PortalSection = (typeof PORTAL_SECTIONS)[number]

export interface PortalSectionMovie {
  id: number
  title: string
  posterImage: string | null
  synopsis: string
  classification: string | null
  runningTime: number
  genres: readonly string[]
  /** YYYY-MM-DD; null when the movie is already showing. */
  releaseDate: string | null
  /** YYYY-MM-DD; null when it has no presale. */
  presaleStart: string | null
}
