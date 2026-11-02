import {
  IsIn,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  PROJECTION_FORMATS,
  PROJECTION_TECHNOLOGIES,
  type PricingSettings,
} from '../../common/pricing/ticket-pricing';
import { PROJECTION_MESSAGES } from '../projection-messages';
import {
  SELECTABLE_PROJECTION_STATUSES,
  type ProjectionStatus,
} from '../types/projection.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u;
const DATE_MESSAGE = 'Introduce una fecha válida (AAAA-MM-DD).';
const TIME_MESSAGE = 'Introduce una hora válida (HH:mm).';
const ACTIVITY_MESSAGE = 'Los minutos deben ser un entero entre 0 y 240.';

export class CreateProjectionDto {
  @IsInt({ message: 'Selecciona una película.' })
  @Min(1, { message: 'Selecciona una película.' })
  movieId: number;

  @IsInt({ message: 'Selecciona una sala.' })
  @Min(1, { message: 'Selecciona una sala.' })
  theaterId: number;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  startDate: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  endDate?: string;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime: string;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime: string;

  @IsInt({ message: ACTIVITY_MESSAGE })
  @Min(0, { message: ACTIVITY_MESSAGE })
  @Max(240, { message: ACTIVITY_MESSAGE })
  cleaningMinutes: number;

  @IsInt({ message: ACTIVITY_MESSAGE })
  @Min(0, { message: ACTIVITY_MESSAGE })
  @Max(240, { message: ACTIVITY_MESSAGE })
  advertisementMinutes: number;

  /** Legacy input accepted for compatibility; the pricing policy determines the amount. */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: PROJECTION_MESSAGES.invalidPrice },
  )
  @Min(0.01, { message: PROJECTION_MESSAGES.invalidPrice })
  @Max(99_999_999.99, { message: PROJECTION_MESSAGES.invalidPrice })
  price?: number;

  @IsOptional()
  @IsIn(SELECTABLE_PROJECTION_STATUSES, {
    message: 'El estado debe ser activa o inactiva.',
  })
  status?: ProjectionStatus;
  @IsOptional()
  @IsIn(PROJECTION_FORMATS, { message: 'Selecciona 2D o 3D.' })
  format?: PricingSettings['format'];
  @IsOptional()
  @IsIn(PROJECTION_TECHNOLOGIES, {
    message: 'Selecciona una tecnología válida.',
  })
  technology?: PricingSettings['technology'];
  @IsOptional()
  @IsBoolean({ message: 'Indica si la función es un estreno.' })
  isPremiere?: boolean;
}
