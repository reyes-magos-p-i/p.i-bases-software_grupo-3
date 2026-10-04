import { Test, TestingModule } from '@nestjs/testing';
import { ProjectorsController } from './projectors.controller';
import { ProjectorsService } from './projectors.service';

describe('ProjectorsController', () => {
  let controller: ProjectorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectorsController],
      providers: [ProjectorsService],
    }).compile();

    controller = module.get<ProjectorsController>(ProjectorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
