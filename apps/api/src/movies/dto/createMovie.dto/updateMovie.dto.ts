import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';

export class UpdateMovieDto {
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsInt()
  @Min(1)
  runningTime?: number;

  @IsString()
  @IsNotEmpty()
  synopsis?: string;

  @IsString()
  @IsNotEmpty()
  posterImage: string;

  @IsInt()
  releaseYear?: number;

  @IsInt()
  classificationId?: number;

  @IsArray()
  @IsInt({ each: true })
  languageIds?: number[];

  @IsArray()
  @IsInt({ each: true })
  genreIds?: number[];
}
