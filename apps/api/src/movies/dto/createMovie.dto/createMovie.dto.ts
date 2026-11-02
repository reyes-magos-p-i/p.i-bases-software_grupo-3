import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateMovieDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @Min(1)
  runningTime: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, {
    message: 'La sinopsis no puede superar los 1000 caracteres.',
  })
  synopsis: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  posterImage: string;

  @IsInt()
  releaseYear: number;

  @IsInt()
  classificationId: number;

  @IsArray()
  @IsInt({ each: true })
  languageIds: number[];

  @IsArray()
  @IsInt({ each: true })
  genreIds: number[];
}
