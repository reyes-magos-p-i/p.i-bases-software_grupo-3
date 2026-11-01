import { IsFK } from '../../common/validation/fk.decorator';

// Only the movie function can be changed. The seat is derived from the chosen alternative showtime.
export class UpdateTicketDto {
  @IsFK()
  movieFunctionId: number;
}
