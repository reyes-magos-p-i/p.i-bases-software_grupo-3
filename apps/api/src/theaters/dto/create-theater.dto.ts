import {
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    Max,
    Min,
    registerDecorator,
    ValidationArguments,
} from 'class-validator';
import type { TheaterStatus } from '../entities/theater.entity';

function SeatsMatchDimensions() {
    return (target: object, propertyName: string) => {
        registerDecorator({
            name: 'seatsMatchDimensions',
            target: target.constructor,
            propertyName,
            options: {
                message: 'numberOfSeats must equal dimensionX * dimensionY',
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
    @IsInt()
    branchId: number;

    @IsInt()
    @Min(1)
    @Max(5000)
    @SeatsMatchDimensions()
    numberOfSeats: number;

    @IsInt()
    @Min(1)
    dimensionX: number;

    @IsInt()
    @Min(1)
    dimensionY: number;

    @IsIn(['IMAX', '70mm'])
    projectorName: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsIn(['Disponible', 'En función'])
    status?: TheaterStatus;
}
