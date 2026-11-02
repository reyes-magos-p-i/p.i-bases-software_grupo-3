import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';

import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';

describe('ImageHandlerController', () => {
  let controller: ImageHandlerController;
  let service: {
    savePoster: jest.Mock;
  };

  const file = {
    fieldname: 'image',
    originalname: 'poster.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('image-content'),
  } as Express.Multer.File;

  beforeEach(() => {
    service = {
      savePoster: jest.fn(),
    };

    controller = new ImageHandlerController(
      service as unknown as ImageHandlerService,
    );
  });

  it('passes the uploaded file to the service and returns its result', async () => {
    const result = {
      filename: 'poster.webp',
      path: '/uploads/posters/poster.webp',
    };

    service.savePoster.mockResolvedValueOnce(result);

    await expect(controller.uploadPoster(file))
      .resolves.toEqual(result);

    expect(service.savePoster).toHaveBeenCalledTimes(1);
    expect(service.savePoster).toHaveBeenCalledWith(file);
  });

  it('delegates missing-file validation to the service', async () => {
    const error = new BadRequestException(
      'Debe seleccionar una imagen.',
    );

    service.savePoster.mockRejectedValueOnce(error);

    await expect(controller.uploadPoster())
      .rejects.toBe(error);

    expect(service.savePoster).toHaveBeenCalledWith(undefined);
  });

  it.each([
    new BadRequestException('Imagen inválida.'),
    new PayloadTooLargeException('La imagen supera 5 MB.'),
    new Error('Disk full'),
  ])('propagates service errors: %s', async (error) => {
    service.savePoster.mockRejectedValueOnce(error);

    await expect(controller.uploadPoster(file))
      .rejects.toBe(error);
  });
});
