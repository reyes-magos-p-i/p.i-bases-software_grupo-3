import { Matches, MaxLength } from 'class-validator';
import { IsFK } from '../../common/validation/fk.decorator';

// Seats are identified as "<row>-<column>" and the column holds up to 10 characters.
const SEAT_PATTERN = /^\d+-\d+$/u;

export class CreateTicketDto {
  @IsFK()
  invoiceId: number;

  @IsFK()
  productId: number;

  @IsFK()
  movieFunctionId: number;

  @MaxLength(10)
  @Matches(SEAT_PATTERN)
  seat: string;
}
