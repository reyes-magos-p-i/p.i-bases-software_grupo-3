/** Dates and hours are strings so the API does not shift them across time zones. */
export interface PromotionListItem {
  promotionId: number;
  promotionType: 'percentage' | 'fixed';
  technology: 'STANDARD' | 'IMAX' | '70MM' | null;
  promotionTitle: string;
  projectionFormat: '2D' | '3D' | null;
  beginDate: string;
  endDate: string;
}

export interface PromotionDetail extends PromotionListItem {
  promotionAmount: number;
  description: string;
  conditions: string | null;
  posterPath: string | null;
  /** HH:mm; endHour can be 24:00. Null means all day. */
  beginHour: string | null;
  endHour: string | null;
  /** 1 = Monday through 7 = Sunday. Empty means every day. */
  weekdays: number[];
  /** IDs from promotion_cinemas.branch_id. Empty means no cinema association. */
  branchIds: number[];
}

/** Eligible promotion information for a function selection.
 * Association arrays are omitted: eligibility has already been checked in SQL.
 */
export type ApplicablePromotion = Omit<PromotionDetail, 'weekdays' | 'branchIds'>;
