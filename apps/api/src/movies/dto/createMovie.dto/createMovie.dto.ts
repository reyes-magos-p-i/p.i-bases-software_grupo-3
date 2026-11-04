import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../../common/validation/max-utf8-bytes.decorator';

export class CreateMovieDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El título debe ser texto.' })
  @IsNotEmpty({ message: 'El título es obligatorio.' })
  @MaxLength(100, { message: 'El título no puede superar los 100 caracteres.' })
  @MaxUtf8Bytes(100, {
    message: 'El título es demasiado largo o contiene caracteres no admitidos.',
  })
  title: string;

  @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
  @Min(1, { message: 'La duración debe ser de al menos 1 minuto.' })
  @Max(999, { message: 'La duración no puede superar los 999 minutos.' })
  runningTime: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La sinopsis debe ser texto.' })
  @IsNotEmpty({ message: 'La sinopsis es obligatoria.' })
  @MaxLength(1000, {
    message: 'La sinopsis no puede superar los 1000 caracteres.',
  })
  @MaxUtf8Bytes(4000, {
    message: 'La sinopsis contiene caracteres no admitidos.',
  })
  synopsis: string;

  @IsOptional()
  @IsString({ message: 'La referencia del póster debe ser texto.' })
  @IsNotEmpty({ message: 'Selecciona una imagen válida.' })
  posterImage: string;

  @IsInt({ message: 'El año de estreno debe ser un número entero.' })
  @Min(1888, { message: 'El año de estreno debe ser 1888 o posterior.' })
  @Max(2077, { message: 'El año de estreno no puede ser posterior a 2077.' })
  releaseYear: number;

  @IsInt({ message: 'Selecciona una clasificación válida.' })
  @Min(1, { message: 'Selecciona una clasificación válida.' })
  classificationId: number;

  @IsArray({ message: 'Selecciona los idiomas de la película.' })
  @ArrayNotEmpty({ message: 'Selecciona al menos un idioma.' })
  @ArrayUnique({ message: 'No repitas idiomas.' })
  @IsInt({ each: true, message: 'Selecciona únicamente idiomas disponibles.' })
  @Min(1, { each: true, message: 'Selecciona únicamente idiomas disponibles.' })
  languageIds: number[];

  @IsArray({ message: 'Selecciona los géneros de la película.' })
  @ArrayNotEmpty({ message: 'Selecciona al menos un género.' })
  @ArrayUnique({ message: 'No repitas géneros.' })
  @IsInt({ each: true, message: 'Selecciona únicamente géneros disponibles.' })
  @Min(1, { each: true, message: 'Selecciona únicamente géneros disponibles.' })
  genreIds: number[];
}
