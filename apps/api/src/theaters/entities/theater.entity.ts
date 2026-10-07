import { IsInt, Max, Min } from 'class-validator';

export class Theater {
    theaterId: number;
    branchId: number;
    @IsInt()
    @Min(1)
    @Max(4999)
    numberOfSeats: number;
    @IsInt()
    @Min(1)
    dimensionX: number;
    @IsInt()
    @Min(1)
    dimensionY: number;
    projectorName: string;
    isActive: boolean;
    status: TheaterStatus;
}

export type TheaterStatus = 'Disponible' | 'En función';
