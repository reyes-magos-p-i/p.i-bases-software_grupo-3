import { PartialType } from '@nestjs/mapped-types';
import { CreateCinemaDto } from './create-cinema.dto';

export class UpdateCinemaDto extends PartialType(CreateCinemaDto) {}
