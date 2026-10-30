import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const BRANCH_NAME_MAX_LENGTH = 50;
const NAME_REQUIRED = 'El nombre es obligatorio';
const COMPANY_REQUIRED = 'Debe seleccionar una compañía';

export class CreateCinemaDto {
  // Trimmed so a name of only spaces counts as empty; NFC so "ó" is one character.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  )
  @IsString({ message: NAME_REQUIRED })
  @Matches(/\S/u, { message: NAME_REQUIRED })
  @Matches(/^[\p{L}\p{M} ]*$/u, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  @MaxLength(BRANCH_NAME_MAX_LENGTH, {
    message: 'El nombre debe tener entre 1 y 50 caracteres',
  })
  name: string;

  @IsInt({ message: COMPANY_REQUIRED })
  @Min(1, { message: COMPANY_REQUIRED })
  @Max(Number.MAX_SAFE_INTEGER, { message: COMPANY_REQUIRED })
  companyId: number;
}
