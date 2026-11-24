import { CreatePromotionDto } from './create-promotion.dto';

/** PUT replaces the editable fields and both association sets.
 * Required fields remain required; optional omissions clear their restrictions.
 * Inherited class-validator decorators enforce the same limits as creation.
 */
export class UpdatePromotionDto extends CreatePromotionDto {}
