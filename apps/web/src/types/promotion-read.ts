import type { ProjectionFormat, PromotionType, Technology } from './promotion'

/** Matches GET /promotions from the NestJS module. */
export interface PromotionListItem {
  promotionId: number
  promotionType: PromotionType
  technology: Technology | null
  promotionTitle: string
  projectionFormat: ProjectionFormat | null
  beginDate: string
  endDate: string
}

/** Matches GET /promotions/:id. Dates and hours remain timezone-free strings. */
export interface PromotionDetail extends PromotionListItem {
  promotionAmount: number
  description: string
  conditions: string | null
  posterPath: string | null
  beginHour: string | null
  endHour: string | null
  weekdays: number[]
  branchIds: number[]
}
