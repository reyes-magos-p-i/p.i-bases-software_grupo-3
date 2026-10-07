import { MODULE_METADATA } from '@nestjs/common/constants';
import { ProjectionsController } from './projections.controller';
import { ProjectionsModule } from './projections.module';
import { ProjectionsRepository } from './projections.repository';
import { ProjectionsService } from './projections.service';

describe('ProjectionsModule', () => {
  it('wires the controller with its service and repository', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ProjectionsModule)).toEqual([
      ProjectionsController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProjectionsModule)).toEqual(
      expect.arrayContaining([ProjectionsService, ProjectionsRepository]),
    );
  });
});
