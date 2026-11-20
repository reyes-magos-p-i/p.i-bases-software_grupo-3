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
