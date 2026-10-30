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
