export class Theater {
    theaterId: number;
    branchId: number;
    numberOfSeats: number;
    dimensionX: number;
    dimensionY: number;
    projectorName: string;
    isActive: boolean;
    status: TheaterStatus;
}

export type TheaterStatus = 'Disponible' | 'En función';
