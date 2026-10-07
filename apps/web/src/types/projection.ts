export type ProjectionStatus = 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'IN_PROGRESS' | 'FINISHED'

export const PROJECTION_STATUS_LABELS: Record<ProjectionStatus, string> = {
  ACTIVE: 'Activa',
  INACTIVE: 'Inactiva',
  CANCELLED: 'Cancelada',
  IN_PROGRESS: 'En curso',
  FINISHED: 'Finalizada',
}

export interface ProjectionCinema {
  branchId: number
  name: string
}

export interface ProjectionTheater {
  theaterId: number
  branchId: number
  numberOfSeats: number
}

export interface ProjectionSchedulingOptions {
  cinemas: ProjectionCinema[]
  theaters: ProjectionTheater[]
  defaultTicketPrice: number
}

export interface AvailableMovie {
  movieId: number
  title: string
  runningTime: number
  posterImage: string
}

export interface CreateProjectionRequest {
  movieId: number
  theaterId: number
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  cleaningMinutes: number
  advertisementMinutes: number
  price: number
  status: 'ACTIVE' | 'INACTIVE'
}

export interface CreatedProjections {
  status: ProjectionStatus
  price: number
  projections: { movieFunctionId: number; startTime: string; endTime: string }[]
}

export interface ProjectionApiError {
  statusCode?: number
  message?: string | string[]
}
