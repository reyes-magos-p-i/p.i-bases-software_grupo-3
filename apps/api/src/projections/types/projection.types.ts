import type { ProjectionSlot } from '../projection-schedule';

export const PROJECTION_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'CANCELLED',
  'IN_PROGRESS',
  'FINISHED',
] as const;
export type ProjectionStatus = (typeof PROJECTION_STATUSES)[number];

/** Statuses an administrator may choose when scheduling. */
export const SELECTABLE_PROJECTION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export interface ProjectionCatalogs {
  cinemas: { branchId: number; name: string }[];
  theaters: { theaterId: number; branchId: number; numberOfSeats: number }[];
}

export interface ProjectionSchedulingOptions extends ProjectionCatalogs {
  defaultTicketPrice: number;
}

export interface AvailableMovie {
  movieId: number;
  title: string;
  runningTime: number;
  posterImage: string;
}

export interface NewProjections {
  movieId: number;
  theaterId: number;
  price: number;
  status: ProjectionStatus;
  cleaningMinutes: number;
  advertisementMinutes: number;
  slots: ProjectionSlot[];
}

export interface CreatedProjection {
  movieFunctionId: number;
  startTime: string;
  endTime: string;
}

export interface CreatedProjections {
  status: ProjectionStatus;
  price: number;
  projections: CreatedProjection[];
}
