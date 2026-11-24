export interface UpcomingMovieFunction {
  title: string;
  posterImage: string;
}
export interface PortalMovie extends UpcomingMovieFunction {
  id: number;
}

export interface MoviePreferences {
  genreIds: number[];
  languageIds: number[];
}

export interface MoviePreferenceCandidate
  extends PortalMovie, MoviePreferences {}

export interface MoviePurchaseAffinity {
  id: number;
  purchaseCount: number;
}

export interface MoviePurchaseHistory {
  purchasedMovieIds: number[];
  genres: MoviePurchaseAffinity[];
  languages: MoviePurchaseAffinity[];
}

export interface MovieRecommendation {
  movie: MoviePreferenceCandidate;
  preferenceScore: number;
  purchaseScore: number;
  score: number;
  recommended: boolean;
}

// SCRUM-437: the portal shows each movie in exactly one of these sections (docs/portal-sections.md).
export const PORTAL_SECTIONS = ['cartelera', 'preventas', 'estrenos'] as const;
export type PortalSection = (typeof PORTAL_SECTIONS)[number];

export interface PortalSectionMovie {
  id: number;
  title: string;
  posterImage: string | null;
  synopsis: string;
  classification: string | null;
  runningTime: number;
  genres: string[];
  /** YYYY-MM-DD; null when the movie is already showing. */
  releaseDate: string | null;
  /** YYYY-MM-DD; null when it has no presale. */
  presaleStart: string | null;
}

// SCRUM-439: a Cartelera or Preventas movie, with the section that sells it.
export interface OnSaleMovie extends PortalSectionMovie {
  section: Exclude<PortalSection, 'estrenos'>;
}

// SCRUM-439: a movie recommended by the client's preferences or purchase history.
export interface RecommendedMovie extends OnSaleMovie {
  /**
   * The first favorite genre it matches, shown as "Te gusta <género>"; null when it is
   * recommended by language or by purchases.
   */
  matchedGenre: string | null;
}

export interface PortalRecommendations {
  /** Names of the client's favorite genres; empty when the client has none. */
  genres: string[];
  /** Names of the client's favorite languages; empty when the client has none. */
  languages: string[];
  movies: RecommendedMovie[];
}
