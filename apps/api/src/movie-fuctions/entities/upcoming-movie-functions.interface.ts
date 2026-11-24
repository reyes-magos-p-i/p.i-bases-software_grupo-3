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
