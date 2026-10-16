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
    @IsCinemaName()
    cinema: string;

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
    @IsString()
    @IsNotEmpty()
    status?: string;
}
