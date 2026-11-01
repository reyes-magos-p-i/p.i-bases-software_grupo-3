import { PickType } from '@nestjs/mapped-types';
import { CreateProjectionDto } from './create-projection.dto';
export class ProjectionPriceQueryDto extends PickType(CreateProjectionDto, [
  'format',
  'technology',
  'isPremiere',
] as const) {}
