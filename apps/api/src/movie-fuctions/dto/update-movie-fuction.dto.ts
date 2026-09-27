import { PartialType } from '@nestjs/mapped-types';
import { CreateMovieFuctionDto } from './create-movie-fuction.dto';

export class UpdateMovieFuctionDto extends PartialType(CreateMovieFuctionDto) {}
