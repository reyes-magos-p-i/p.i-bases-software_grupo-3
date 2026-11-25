import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';
import { IMAGES_DIRECTORY } from './image.config';

describe('ImageHandlerController', () => {
  let controller: ImageHandlerController;
  let service: {
    savePoster: jest.Mock;
    savePromotionPoster: jest.Mock;
  };
  let sendFile: jest.Mock;
  let response: Response;

  beforeEach(() => {
    service = {
      savePoster: jest.fn(),
      savePromotionPoster: jest.fn(),
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

  describe('uploadPromotionPoster', () => {
    it('delegates the uploaded file and returns the saved promotion poster', async () => {
      const file = {
        fieldname: 'image', originalname: 'banner.png', encoding: '7bit',
        mimetype: 'image/png', size: 5, buffer: Buffer.from('image'),
      } as Express.Multer.File;
      const saved = {
        filename: '12345678-1234-4234-8234-123456789abc.webp',
        path: '/uploads/promotions/12345678-1234-4234-8234-123456789abc.webp',
      };
      service.savePromotionPoster.mockResolvedValue(saved);

      await expect(controller.uploadPromotionPoster(file)).resolves.toBe(saved);
      expect(service.savePromotionPoster).toHaveBeenCalledTimes(1);
      expect(service.savePromotionPoster).toHaveBeenCalledWith(file);
      expect(service.savePoster).not.toHaveBeenCalled();
    });

    it('passes a missing file to the service and propagates its validation error', async () => {
      const error = new BadRequestException('Seleccione una imagen válida.');
      service.savePromotionPoster.mockRejectedValue(error);

      await expect(controller.uploadPromotionPoster()).rejects.toBe(error);
      expect(service.savePromotionPoster).toHaveBeenCalledWith(undefined);
    });

    it('propagates storage errors without changing them', async () => {
      const file = { buffer: Buffer.from('image') } as Express.Multer.File;
      const error = new Error('Disk full');
      service.savePromotionPoster.mockRejectedValue(error);

      await expect(controller.uploadPromotionPoster(file)).rejects.toBe(error);
      expect(service.savePoster).not.toHaveBeenCalled();
    });
  });

  describe('getPromotionPoster', () => {
    const filename = '12345678-1234-4234-8234-123456789abc.webp';

    it('serves the UUID-named WebP from the promotions directory', () => {
      const result = controller.getPromotionPoster(filename, response);

      expect(sendFile).toHaveBeenCalledTimes(1);
      expect(sendFile).toHaveBeenCalledWith(filename, {
        root: join(IMAGES_DIRECTORY, 'promotions'),
      });
      expect(result).toBe(response);
    });

    it('accepts uppercase UUIDs and extensions as allowed by the route validator', () => {
      const uppercase = filename.toUpperCase();
      controller.getPromotionPoster(uppercase, response);
      expect(sendFile).toHaveBeenCalledWith(uppercase, {
        root: join(IMAGES_DIRECTORY, 'promotions'),
      });
    });

    it.each([
      '', '.', '..', 'banner.webp',
      '../12345678-1234-4234-8234-123456789abc.webp',
      'folder/12345678-1234-4234-8234-123456789abc.webp',
      'folder\\12345678-1234-4234-8234-123456789abc.webp',
      '/12345678-1234-4234-8234-123456789abc.webp',
      '12345678-1234-4234-8234-123456789abc.png',
      '12345678-1234-4234-8234-123456789abc.webp.exe',
      '12345678-1234-4234-8234-123456789abg.webp',
      '12345678123442348234123456789abc.webp',
      '12345678-1234-4234-8234-123456789abc.webp?download=1',
    ])('rejects an invalid promotion filename: %j', (value) => {
      expect(() => controller.getPromotionPoster(value, response))
        .toThrow(new NotFoundException('Póster no encontrado.'));
      expect(sendFile).not.toHaveBeenCalled();
    });

    it('propagates synchronous sendFile failures', () => {
      const error = new Error('sendFile failed');
      sendFile.mockImplementationOnce(() => { throw error; });
      expect(() => controller.getPromotionPoster(filename, response)).toThrow(error);
    });
  });
});
