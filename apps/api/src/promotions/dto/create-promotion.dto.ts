// dto/create-promotion.dto.ts
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePromotionDto {
  @IsIn(['percentage', 'fixed'])
  promotionType!: 'percentage' | 'fixed';

  @IsNumber({
    allowNaN: false,
    allowInfinity: false,
    maxDecimalPlaces: 2,
  })
  @Min(0.01)
  @Max(4000)
  promotionAmount!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'beginDate must use YYYY-MM-DD.',
  })
  beginDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must use YYYY-MM-DD.',
  })
  endDate!: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'beginHour must use HH:mm between 00:00 and 23:59.',
  })
  beginHour?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, {
    message: 'endHour must use HH:mm; 24:00 is also allowed.',
  })
  endHour?: string | null;

  @IsOptional()
  @IsIn(['2D', '3D'])
  projectionFormat?: '2D' | '3D' | null;

  @IsOptional()
  @IsIn(['STANDARD', 'IMAX', '70MM'])
  technology?: 'STANDARD' | 'IMAX' | '70MM' | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'promotionTitle cannot contain only spaces.',
  })
  @MaxLength(150)
  promotionTitle!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'description cannot contain only spaces.',
  })
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conditions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  posterPath?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[] | null;

  @IsArray()
  @ArrayNotEmpty({
    message: 'Select at least one cinema.',
  })
  @ArrayUnique({
    message: 'Cinema IDs cannot be repeated.',
  })
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds!: number[];

}
