import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';

describe('ImageHandlerController', () => {
  let controller: ImageHandlerController;
  let service: {
    savePoster: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      savePoster: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageHandlerController],
      providers: [
        {
          provide: ImageHandlerService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<ImageHandlerController>(ImageHandlerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the uploaded file to the service and returns its response', async () => {
    const file = {
      fieldname: 'image',
      originalname: 'poster.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('image content'),
      size: 13,
    } as Express.Multer.File;

    const response = {
      filename: 'poster.webp',
      path: '/uploads/posters/poster.webp',
    };

    service.savePoster.mockResolvedValue(response);

    await expect(controller.uploadPoster(file)).resolves.toEqual(response);

    expect(service.savePoster).toHaveBeenCalledTimes(1);
    expect(service.savePoster).toHaveBeenCalledWith(file);
  });

  it('passes undefined to the service when no file is provided', async () => {
    const error = new BadRequestException('Archivo requerido');
    service.savePoster.mockRejectedValue(error);

    await expect(controller.uploadPoster()).rejects.toBe(error);

    expect(service.savePoster).toHaveBeenCalledTimes(1);
    expect(service.savePoster).toHaveBeenCalledWith(undefined);
  });

  it('propagates service errors', async () => {
    const file = {
      buffer: Buffer.from('invalid image'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    const error = new BadRequestException('Imagen inválida');
    service.savePoster.mockRejectedValue(error);

    await expect(controller.uploadPoster(file)).rejects.toBe(error);
  });
});
