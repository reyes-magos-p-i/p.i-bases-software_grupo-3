import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { IsCinemaName } from '../../common/validation/cinema-name.decorator';

function SeatsMatchDimensions() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'seatsMatchDimensions',
      target: target.constructor,
      propertyName,
      options: {
        message: 'El número de asientos debe ser igual a filas por columnas.',
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const { numberOfSeats, dimensionX, dimensionY } = args.object as {
            numberOfSeats?: number;
            dimensionX?: number;
            dimensionY?: number;
          };
          if (
            numberOfSeats === undefined ||
            dimensionX === undefined ||
            dimensionY === undefined
          ) {
            return true;
          }
          return numberOfSeats === dimensionX * dimensionY;
        },
      },
    });
  };
}

export class CreateTheaterDto {
  @IsCinemaName()
  cinema: string;

  @IsInt({ message: 'Escribe un número entero.' })
  @Min(1, { message: 'El valor debe ser mayor o igual que 1.' })
  @Max(5000, { message: 'La sala puede tener como máximo 5000 asientos.' })
  @SeatsMatchDimensions()
  numberOfSeats: number;

  @IsInt({ message: 'Escribe un número entero.' })
  @Min(1, { message: 'El valor debe ser mayor o igual que 1.' })
  dimensionX: number;

  @IsInt({ message: 'Escribe un número entero.' })
  @Min(1, { message: 'El valor debe ser mayor o igual que 1.' })
  dimensionY: number;

  @IsIn(['IMAX', '70mm'], { message: 'Selecciona un proyector válido.' })
  projectorName: string;

  @IsOptional()
  @IsBoolean({ message: 'Selecciona un estado de activación válido.' })
  isActive?: boolean;

  @IsOptional()
  @IsString({ message: 'El estado debe ser texto.' })
  @IsNotEmpty({ message: 'Selecciona un estado de sala.' })
  status?: string;
}
