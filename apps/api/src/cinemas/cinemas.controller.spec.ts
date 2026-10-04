import { Test, TestingModule } from '@nestjs/testing';
import { CinemasController } from './cinemas.controller';
import { CinemasService } from './cinemas.service';

describe('CinemasController', () => {
  let controller: CinemasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CinemasController],
      providers: [CinemasService],
    }).compile();

    controller = module.get<CinemasController>(CinemasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
