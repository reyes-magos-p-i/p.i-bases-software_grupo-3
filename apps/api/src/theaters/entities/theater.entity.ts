import { IsInt, Max, Min } from 'class-validator';

export class Theater {
    theaterId: number;
    cinema: string;
    @IsInt()
    @Min(1)
    @Max(5000)
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
