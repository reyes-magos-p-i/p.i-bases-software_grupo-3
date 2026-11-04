import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ArrayUnique, IsArray, IsInt, IsOptional, Min } from 'class-validator';
import { CreateMovieDto } from './createMovie.dto';

export class UpdateMovieDto extends PartialType(
  OmitType(CreateMovieDto, ['languageIds', 'genreIds'] as const),
  { skipNullProperties: false },
) {
  // Updates retain the existing ability to clear a movie's catalog associations.
  @IsOptional()
  @IsArray({ message: 'Selecciona los idiomas de la película.' })
  @ArrayUnique({ message: 'No repitas idiomas.' })
  @IsInt({ each: true, message: 'Selecciona únicamente idiomas disponibles.' })
  @Min(1, { each: true, message: 'Selecciona únicamente idiomas disponibles.' })
  languageIds?: number[];

  @IsOptional()
  @IsArray({ message: 'Selecciona los géneros de la película.' })
  @ArrayUnique({ message: 'No repitas géneros.' })
  @IsInt({ each: true, message: 'Selecciona únicamente géneros disponibles.' })
  @Min(1, { each: true, message: 'Selecciona únicamente géneros disponibles.' })
  genreIds?: number[];
}
