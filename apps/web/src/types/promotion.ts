export interface CinemaOption {
  id: number
  name: string
}

export type PromotionType = 'percentage' | 'fixed'
export type ProjectionFormat = '2D' | '3D'
export type Technology = 'STANDARD' | 'IMAX' | '70MM'

export interface CreatePromotionPayload {
  promotionType: PromotionType
  promotionAmount: number
  beginDate: string
  endDate: string
  beginHour: string | null
  endHour: string | null
  projectionFormat: ProjectionFormat | null
  technology: Technology | null
  promotionTitle: string
  description: string
  conditions: string | null
  posterPath: string | null
  weekdays: number[]
  branchIds: number[]
}

export interface PromotionForm {
  promotionType: PromotionType | ''
  amount: string
  beginDate: string
  endDate: string
  allDay: boolean
  beginHour: string
  endHour: string
  projectionFormat: ProjectionFormat | ''
  technology: Technology | ''
  promotionTitle: string
  description: string
  conditions: string
  posterPath: string | null
  weekdays: number[]
  branchIds: number[]
}

export type PromotionErrors = Partial<Record<keyof PromotionForm | 'poster', string>>

/** PUT uses the same complete editable payload as POST. */
export type UpdatePromotionPayload = CreatePromotionPayload
