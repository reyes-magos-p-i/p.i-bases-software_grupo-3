export type TheaterStatus = string

export interface TheaterStatusOption {
  theaterStatusId: number
  name: TheaterStatus
}

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
  statuses: TheaterStatusOption[]
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
