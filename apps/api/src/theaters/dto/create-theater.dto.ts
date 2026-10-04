import { IsIn, IsInt } from 'class-validator';

export class CreateTheaterDto {
    @IsInt()
    branchId: number;

    @IsInt()
    numberOfSeats: number;

    @IsInt()
    dimensionX: number;

    @IsInt()
    dimensionY: number;

    @IsIn(['IMAX', '70mm'])
    projectorName: string;
}
