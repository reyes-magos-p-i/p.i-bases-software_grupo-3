import { Controller, Get, Header, Param } from '@nestjs/common';
import { MovieFuctionsService } from './movie-fuctions.service';
import { PortalSectionParamsDto } from './dto/portal-section-params.dto';

@Controller('movie-fuctions')
export class MovieFuctionsController {
  constructor(private readonly movieFuctionsService: MovieFuctionsService) {}
  @Get()
  findAll() {
    return this.movieFuctionsService.findAll();
  }
  @Get('catalog')
  @Header('Cache-Control', 'no-store')
  findCatalog() {
    return this.movieFuctionsService.findCatalog();
  }
  // SCRUM-437: one public request per portal section, so a failing section doesn't hide the others.
  @Get('sections/:section')
  @Header('Cache-Control', 'no-store')
  findSection(@Param() { section }: PortalSectionParamsDto) {
    return this.movieFuctionsService.findSection(section);
  }
}
