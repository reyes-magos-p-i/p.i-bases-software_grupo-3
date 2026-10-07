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

/** A modification reschedules a single date. */
export type UpdateProjectionRequest = Omit<CreateProjectionRequest, 'endDate'>

export interface CreatedProjections {
  status: ProjectionStatus
  price: number
  projections: { movieFunctionId: number; startTime: string; endTime: string }[]
}

export interface ProjectionFilterOptions {
  cinemas: ProjectionCinema[]
  theaters: ProjectionTheater[]
  movies: { movieId: number; title: string }[]
}

export interface ProjectionListQuery {
  page: number
  pageSize: number
  search?: string
  status?: ProjectionStatus
  branchId?: number
  theaterId?: number
  movieId?: number
  dateFrom?: string
  dateTo?: string
  timeFrom?: string
  timeTo?: string
}

export interface ListedProjection {
  movieFunctionId: number
  movieId: number
  movieTitle: string
  branchId: number
  branchName: string
  theaterId: number
  startTime: string
  endTime: string
  status: ProjectionStatus
  price: number | null
}

export interface ProjectionList {
  items: ListedProjection[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ProjectionDetail extends ListedProjection {
  runningTime: number
  posterImage: string
  createdAt: string
  cleaningMinutes: number | null
  advertisementMinutes: number | null
}

export interface ProjectionApiError {
  statusCode?: number
  message?: string | string[]
}
