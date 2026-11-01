import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export const MAX_PREFERENCE_SELECTIONS = 1000;

function PreferenceIds(label: string): PropertyDecorator {
  const message = `La selección de ${label} no es válida. Vuelve a cargar las opciones.`;
  return applyDecorators(
    IsDefined({
      message: `Selecciona tus ${label} o envía una selección vacía.`,
    }),
    IsArray({ message }),
    ArrayMaxSize(MAX_PREFERENCE_SELECTIONS, {
      message: `Selecciona como máximo ${MAX_PREFERENCE_SELECTIONS} ${label}.`,
    }),
    ArrayUnique({
      message: `La selección de ${label} contiene opciones repetidas.`,
    }),
    IsInt({ each: true, message }),
    Min(1, { each: true, message }),
    Max(Number.MAX_SAFE_INTEGER, { each: true, message }),
  );
}

export class UpdateClientPreferencesDto {
  @PreferenceIds('géneros')
  genreIds: number[];

  @PreferenceIds('idiomas')
  languageIds: number[];
}
