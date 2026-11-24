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

// SCRUM-439: Cartelera and Preventas movies recommended by the client's preferences or purchases.
export interface RecommendedMovie extends PortalSectionMovie {
  section: Exclude<PortalSection, 'estrenos'>
  /** Shown as "Te gusta <género>"; null when it is recommended by language or by purchases. */
  matchedGenre: string | null
}

export interface PortalRecommendations {
  /** Names of the client's favorite genres; empty when the client has none. */
  genres: readonly string[]
  /** Names of the client's favorite languages; empty when the client has none. */
  languages: readonly string[]
  movies: readonly RecommendedMovie[]
}
