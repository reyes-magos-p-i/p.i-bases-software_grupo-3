import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength

} from 'class-validator';

export class UpdateMovieDto {

  title?: string;
  runningTime?: number;
  synopsis?: string;
  poster_image?: string;
  releaseYear?: number;
  clasification?: number;

}
