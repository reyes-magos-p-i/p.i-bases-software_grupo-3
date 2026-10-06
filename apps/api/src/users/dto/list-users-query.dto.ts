import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MaxUtf8Bytes } from '../../common/validation/max-utf8-bytes.decorator';
import { UserRole } from '../enums/user-role.enum';

export class ListClientsQueryDto {
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser texto.' })
  @Matches(/\S/u, { message: 'La búsqueda no puede contener solo espacios.' })
  @Matches(/^[^\p{Cc}]*$/u, {
    message: 'La búsqueda contiene caracteres de control no válidos.',
  })
  @MaxUtf8Bytes(400)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !/\p{Cc}/u.test(value)
      ? value.trim().replace(/\s+/gu, ' ')
      : value,
  )
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value,
  )
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1)
  @Max(1000000)
  page = 1;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value,
  )
  @IsInt()
  @IsIn([10, 25, 50, 100], {
    message: 'El tamaño de página debe ser 10, 25, 50 o 100.',
  })
  pageSize = 10;

  @IsIn(['id', 'name', 'email', 'createdAt'], {
    message: 'El campo de ordenamiento no es válido.',
  })
  sortBy: string = 'id';

  @IsIn(['asc', 'desc'], {
    message: 'La dirección de ordenamiento no es válida.',
  })
  sortDirection: 'asc' | 'desc' = 'asc';
}

export class ListEmployeesQueryDto extends ListClientsQueryDto {
  @IsIn(['id', 'name', 'email', 'createdAt', 'hireDate', 'role', 'branch'], {
    message: 'El campo de ordenamiento no es válido.',
  })
  declare sortBy: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((role) => role.trim())
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR], {
    message: 'El filtro de rol no es válido.',
    each: true,
  })
  role?: (UserRole.EMPLOYEE | UserRole.ADMINISTRATOR)[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const values: unknown =
      typeof value === 'string' ? value.split(',') : value;
    return Array.isArray(values)
      ? values.map((branch: unknown) =>
          typeof branch === 'string' && /^\d+$/u.test(branch.trim())
            ? Number(branch.trim())
            : branch,
        )
      : values;
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  branchId?: number[];
}
