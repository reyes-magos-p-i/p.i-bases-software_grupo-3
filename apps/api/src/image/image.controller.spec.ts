import { Test, TestingModule } from '@nestjs/testing';
import { ImageController } from './image.controller';
import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const existsSyncMock = existsSync as jest.MockedFunction<typeof existsSync>;

describe('ImageController', () => {
  let controller: ImageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageController],
    }).compile();

    controller = module.get<ImageController>(ImageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('ImageController', () => {
  const controller = new ImageController();
  const res = { sendFile: jest.fn() };

  beforeEach(() => {
    existsSyncMock.mockReset();
    res.sendFile.mockReset();
  });

  it('sends file when it exists', () => {
    existsSyncMock.mockReturnValue(true);

    controller.getImage('cat.png', res as any);

    expect(res.sendFile).toHaveBeenCalledWith(
      join(process.cwd(), 'uploads', 'cat.png'),
    );
  });

  it('throws when missing', () => {
    existsSyncMock.mockReturnValue(false);

    expect(() => controller.getImage('nope.png', res as any)).toThrow(
      NotFoundException,
    );
  });
});
