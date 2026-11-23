import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

import { ImageHandlerService } from './image-handler.service';
import { IMAGES_DIRECTORY, MAX_POSTER_SIZE } from './image.config';

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('ImageHandlerService', () => {
  let service: ImageHandlerService;

  const uuid = '12345678-1234-4234-8234-123456789abc';
  const filename = `${uuid}.webp`;
  const directory = join(IMAGES_DIRECTORY, 'posters');
  const processedImage = Buffer.from('processed-image');

  const processor = {
    metadata: jest.fn(),
    rotate: jest.fn(),
    webp: jest.fn(),
    toBuffer: jest.fn(),
  };

  function makeFile(
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File {
    return {
      fieldname: 'image',
      originalname: 'poster.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('original-image'),
      ...overrides,
    } as Express.Multer.File;
  }

  beforeEach(() => {
    jest.resetAllMocks();

    service = new ImageHandlerService();

    jest.mocked(randomUUID).mockReturnValue(uuid);
    jest.mocked(mkdir).mockResolvedValue(undefined);
    jest.mocked(writeFile).mockResolvedValue(undefined);

    processor.metadata.mockResolvedValue({ format: 'jpeg' });
    processor.rotate.mockReturnValue(processor);
    processor.webp.mockReturnValue(processor);
    processor.toBuffer.mockResolvedValue(processedImage);

    jest.mocked(sharp).mockReturnValue(
      processor as unknown as ReturnType<typeof sharp>,
    );
  });

  it('rejects a missing file', async () => {
    await expect(service.savePoster())
      .rejects.toThrow(BadRequestException);

    expect(sharp).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    await expect(
      service.savePoster(makeFile({ size: 0 })),
    ).rejects.toThrow('Debe seleccionar una imagen.');

    expect(sharp).not.toHaveBeenCalled();
  });

  it('rejects an upload larger than 5 MB', async () => {
    await expect(
      service.savePoster(
        makeFile({ size: MAX_POSTER_SIZE + 1 }),
      ),
    ).rejects.toThrow(PayloadTooLargeException);

    expect(sharp).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('accepts an upload exactly at the size limit', async () => {
    await expect(
      service.savePoster(makeFile({ size: MAX_POSTER_SIZE })),
    ).resolves.toEqual({
      filename,
      path: `/uploads/posters/${filename}`,
    });
  });

  it.each(['jpeg', 'png', 'webp'])(
    'processes and saves a valid %s image',
    async (format) => {
      processor.metadata.mockResolvedValue({ format });
      const file = makeFile();

      const result = await service.savePoster(file);

      expect(sharp).toHaveBeenCalledWith(file.buffer, {
        limitInputPixels: 25_000_000,
      });

      expect(processor.rotate).toHaveBeenCalledTimes(1);
      expect(processor.webp).toHaveBeenCalledWith({
        quality: 85,
      });

      expect(mkdir).toHaveBeenCalledWith(directory, {
        recursive: true,
      });

      expect(writeFile).toHaveBeenCalledWith(
        join(directory, filename),
        processedImage,
        { flag: 'wx' },
      );

      expect(result).toEqual({
        filename,
        path: `/uploads/posters/${filename}`,
      });
    },
  );

  it.each([undefined, 'gif', 'svg'])(
    'rejects an unsupported or missing format: %s',
    async (format) => {
      processor.metadata.mockResolvedValue({ format });

      await expect(service.savePoster(makeFile()))
        .rejects.toThrow(
          'Seleccione una imagen JPEG, PNG o WebP válida.',
        );

      expect(processor.toBuffer).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    },
  );

  it('rejects an image that sharp cannot open', async () => {
    jest.mocked(sharp).mockImplementationOnce(() => {
      throw new Error('Invalid image');
    });

    await expect(service.savePoster(makeFile()))
      .rejects.toThrow(BadRequestException);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects an image when reading metadata fails', async () => {
    processor.metadata.mockRejectedValueOnce(
      new Error('Corrupt metadata'),
    );

    await expect(service.savePoster(makeFile()))
      .rejects.toThrow(BadRequestException);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects an image when conversion fails', async () => {
    processor.toBuffer.mockRejectedValueOnce(
      new Error('Conversion failed'),
    );

    await expect(service.savePoster(makeFile()))
      .rejects.toThrow(BadRequestException);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects a processed image larger than 5 MB', async () => {
    processor.toBuffer.mockResolvedValueOnce(
      Buffer.alloc(MAX_POSTER_SIZE + 1),
    );

    await expect(service.savePoster(makeFile()))
      .rejects.toThrow(
        'La imagen procesada supera el máximo de 5 MB.',
      );

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('accepts a processed image exactly at the size limit', async () => {
    processor.toBuffer.mockResolvedValueOnce(
      Buffer.alloc(MAX_POSTER_SIZE),
    );

    await expect(service.savePoster(makeFile()))
      .resolves.toEqual({
        filename,
        path: `/uploads/posters/${filename}`,
      });
  });

  it('propagates directory creation failures', async () => {
    const failure = new Error('Permission denied');
    jest.mocked(mkdir).mockRejectedValueOnce(failure);

    await expect(service.savePoster(makeFile()))
      .rejects.toBe(failure);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('propagates file writing failures', async () => {
    const failure = new Error('Disk full');
    jest.mocked(writeFile).mockRejectedValueOnce(failure);

    await expect(service.savePoster(makeFile()))
      .rejects.toBe(failure);
  });

  describe('savePromotionPoster', () => {
    const promotionDirectory = join(IMAGES_DIRECTORY, 'promotions');

    it('rejects a missing file before processing or writing', async () => {
      await expect(service.savePromotionPoster())
        .rejects.toThrow(new BadRequestException('Seleccione una imagen válida.'));
      expect(sharp).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('rejects a zero reported size', async () => {
      await expect(service.savePromotionPoster(makeFile({ size: 0 })))
        .rejects.toThrow('Seleccione una imagen válida.');
      expect(sharp).not.toHaveBeenCalled();
    });

    it('rejects an empty buffer even when the reported size is positive', async () => {
      await expect(service.savePromotionPoster(makeFile({ size: 1, buffer: Buffer.alloc(0) })))
        .rejects.toThrow('Seleccione una imagen válida.');
      expect(sharp).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('rejects a reported size over the limit with HTTP 400', async () => {
      await expect(service.savePromotionPoster(makeFile({ size: MAX_POSTER_SIZE + 1 })))
        .rejects.toThrow(new BadRequestException('La imagen debe pesar como máximo 5 MB.'));
      expect(sharp).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('checks the actual buffer size independently of the reported size', async () => {
      await expect(service.savePromotionPoster(makeFile({
        size: 1, buffer: Buffer.alloc(MAX_POSTER_SIZE + 1),
      }))).rejects.toThrow(new BadRequestException('La imagen debe pesar como máximo 5 MB.'));
      expect(sharp).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('accepts a file whose reported and actual size equal the limit', async () => {
      await expect(service.savePromotionPoster(makeFile({
        size: MAX_POSTER_SIZE, buffer: Buffer.alloc(MAX_POSTER_SIZE),
      }))).resolves.toEqual({ filename, path: `/uploads/promotions/${filename}` });
    });

    it.each(['jpeg', 'png', 'webp'])(
      'converts a %s image to WebP and saves it in promotions', async (format) => {
        processor.metadata.mockResolvedValueOnce({ format });
        const file = makeFile();

        const result = await service.savePromotionPoster(file);

        expect(sharp).toHaveBeenCalledTimes(1);
        expect(sharp).toHaveBeenCalledWith(file.buffer, { limitInputPixels: 25_000_000 });
        expect(processor.metadata).toHaveBeenCalledTimes(1);
        expect(processor.rotate).toHaveBeenCalledTimes(1);
        expect(processor.webp).toHaveBeenCalledWith({ quality: 85 });
        expect(processor.toBuffer).toHaveBeenCalledTimes(1);
        expect(randomUUID).toHaveBeenCalledTimes(1);
        expect(mkdir).toHaveBeenCalledWith(promotionDirectory, { recursive: true });
        expect(writeFile).toHaveBeenCalledTimes(1);
        expect(writeFile).toHaveBeenCalledWith(join(promotionDirectory, filename), processedImage);
        expect(result).toEqual({ filename, path: `/uploads/promotions/${filename}` });
      },
    );

    it.each([undefined, 'gif', 'svg', 'tiff'])(
      'rejects unsupported or missing image metadata format: %s', async (format) => {
        processor.metadata.mockResolvedValueOnce({ format });
        await expect(service.savePromotionPoster(makeFile()))
          .rejects.toThrow('La imagen debe ser un archivo JPEG, PNG o WebP válido.');
        expect(processor.toBuffer).not.toHaveBeenCalled();
        expect(mkdir).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
      },
    );

    it('checks decoded image format instead of trusting the client MIME type', async () => {
      processor.metadata.mockResolvedValueOnce({ format: 'gif' });
      await expect(service.savePromotionPoster(makeFile({ mimetype: 'image/png' })))
        .rejects.toThrow(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('converts sharp initialization errors into a validation error', async () => {
      jest.mocked(sharp).mockImplementationOnce(() => { throw new Error('Invalid image'); });
      await expect(service.savePromotionPoster(makeFile()))
        .rejects.toThrow('La imagen debe ser un archivo JPEG, PNG o WebP válido.');
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('converts metadata errors into a validation error', async () => {
      processor.metadata.mockRejectedValueOnce(new Error('Corrupt metadata'));
      await expect(service.savePromotionPoster(makeFile()))
        .rejects.toThrow(BadRequestException);
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('converts image conversion errors into a validation error', async () => {
      processor.toBuffer.mockRejectedValueOnce(new Error('Conversion failed'));
      await expect(service.savePromotionPoster(makeFile()))
        .rejects.toThrow(BadRequestException);
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('propagates directory creation errors and does not write a file', async () => {
      const error = new Error('Permission denied');
      jest.mocked(mkdir).mockRejectedValueOnce(error);
      await expect(service.savePromotionPoster(makeFile())).rejects.toBe(error);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('propagates file writing errors', async () => {
      const error = new Error('Disk full');
      jest.mocked(writeFile).mockRejectedValueOnce(error);
      await expect(service.savePromotionPoster(makeFile())).rejects.toBe(error);
    });
  });
});
