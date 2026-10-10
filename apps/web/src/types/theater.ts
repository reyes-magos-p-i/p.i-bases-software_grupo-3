export type TheaterStatus = 'Disponible' | 'En función'

export interface TheaterProjector {
  projectorId: number
  name: string
}

export interface TheaterCinema {
  branchId: number
  name: string
  companyId: number
}

export interface TheaterCreationOptions {
  projectors: TheaterProjector[]
  cinemas: TheaterCinema[]
}

export interface CreateTheaterRequest {
  cinema: string
  numberOfSeats: number
  dimensionX: number
  dimensionY: number
  projectorName: string
  status?: TheaterStatus
}

export type UpdateTheaterRequest = Partial<CreateTheaterRequest> & { isActive?: boolean }

export interface Theater {
  theaterId: number
  cinema: string
  numberOfSeats: number
  dimensionX: number
  dimensionY: number
  projectorName: string
  isActive: boolean
  status: TheaterStatus
}
