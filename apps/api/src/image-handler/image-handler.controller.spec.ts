import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';
import { IMAGES_DIRECTORY } from './image.config';

describe('ImageHandlerController', () => {
  let controller: ImageHandlerController;
  let service: {
    savePoster: jest.Mock;
  };
  let sendFile: jest.Mock;
  let response: Response;

  beforeEach(() => {
    service = {
      savePoster: jest.fn(),
    };

    controller = new ImageHandlerController(
      service as unknown as ImageHandlerService,
    );

    sendFile = jest.fn();
    response = { sendFile } as unknown as Response;
    sendFile.mockReturnValue(response);
  });

  describe('getPoster', () => {
    it('sends the poster from the posters directory', () => {
      const result = controller.getPoster('poster.webp', response);

      expect(sendFile).toHaveBeenCalledTimes(1);
      expect(sendFile).toHaveBeenCalledWith('poster.webp', {
        root: join(IMAGES_DIRECTORY, 'posters'),
        dotfiles: 'deny',
      });
      expect(result).toBe(response);
    });

    it.each([
      '',
      '.',
      '..',
      '../poster.webp',
      'folder/poster.webp',
      '..\\poster.webp',
      'folder\\poster.webp',
      '/poster.webp',
    ])('rejects an invalid filename: %j', (filename) => {
      expect(() => controller.getPoster(filename, response)).toThrow(
        new NotFoundException('Poster not found'),
      );

      expect(sendFile).not.toHaveBeenCalled();
    });

    it('propagates synchronous sendFile errors', () => {
      const error = new Error('sendFile failed');
      sendFile.mockImplementation(() => {
        throw error;
      });

      expect(() => controller.getPoster('poster.webp', response)).toThrow(
        error,
      );
    });
  });

  describe('uploadPoster', () => {
    it('passes the uploaded file to the service and returns its result', async () => {
      const file = {
        fieldname: 'image',
        originalname: 'poster.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 5,
        buffer: Buffer.from('image'),
      } as Express.Multer.File;

      const savedPoster = {
        filename: 'poster.webp',
        path: '/uploads/posters/poster.webp',
      };

      service.savePoster.mockResolvedValue(savedPoster);

      await expect(controller.uploadPoster(file)).resolves.toEqual(savedPoster);

      expect(service.savePoster).toHaveBeenCalledTimes(1);
      expect(service.savePoster).toHaveBeenCalledWith(file);
    });

    it('passes an undefined file to the service', async () => {
      const error = new Error('Image is required');
      service.savePoster.mockRejectedValue(error);

      await expect(controller.uploadPoster()).rejects.toBe(error);

      expect(service.savePoster).toHaveBeenCalledWith(undefined);
    });

    it('propagates service errors', async () => {
      const file = {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
      } as Express.Multer.File;

      const error = new Error('Unable to save poster');
      service.savePoster.mockRejectedValue(error);

      await expect(controller.uploadPoster(file)).rejects.toBe(error);

      expect(service.savePoster).toHaveBeenCalledWith(file);
    });
  });
});
