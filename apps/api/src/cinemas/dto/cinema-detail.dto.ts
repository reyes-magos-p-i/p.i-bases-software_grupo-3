import type { ListedCinemaDto } from './listed-cinemas.dto';

export type CinemaStatus = 'ACTIVE' | 'INACTIVE';

export interface CinemaDetailDto extends ListedCinemaDto {
  status: CinemaStatus;
}
