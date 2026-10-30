import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SeatPositionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  rowNumber!: number;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  columnNumber!: number;
}

export class UpdateSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => SeatPositionDto)
  seats!: SeatPositionDto[];

  // Validate state when provided, or when neither field was provided.
  // This also rejects a request with no changes.
  @ValidateIf(dto => dto.state !== undefined || dto.type === undefined)
  @IsIn(['free', 'unavailable', 'in-use', 'reserved'], {
    message: 'Provide a valid state, or provide a type.',
  })
  state?: 'free' | 'unavailable' | 'in-use' | 'reserved';

  @ValidateIf(dto => dto.type !== undefined)
  @IsIn(['normal', 'vip', 'accessibility'])
  type?: 'normal' | 'vip' | 'accessibility';
}
