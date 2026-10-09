import { OmitType } from '@nestjs/mapped-types';
import { CreateProjectionDto } from './create-projection.dto';

/**
 * Same fields as a creation for a single date (no range). An omitted price or
 * status keeps the current value of the projection.
 */
export class UpdateProjectionDto extends OmitType(CreateProjectionDto, ['endDate'] as const) {}
