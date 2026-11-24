import { IsIn } from 'class-validator';
import {
  PORTAL_SECTIONS,
  type PortalSection,
} from '../entities/upcoming-movie-functions.interface';

export class PortalSectionParamsDto {
  @IsIn(PORTAL_SECTIONS, {
    message: 'La sección debe ser cartelera, preventas o estrenos.',
  })
  section: PortalSection;
}
