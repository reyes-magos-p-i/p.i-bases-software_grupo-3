import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

import {
  IMAGES_DIRECTORY,
  MAX_POSTER_SIZE,
} from './image.config';

@Injectable()
export class ImageHandlerService {
  async savePoster(file?: Express.Multer.File) {
    if (!file || file.size === 0) {
      throw new BadRequestException(
        'Debe seleccionar una imagen.',
      );
    }

    if (file.size > MAX_POSTER_SIZE) {
      throw new PayloadTooLargeException(
        'La imagen debe pesar como máximo 5 MB.',
      );
    }

    let image: Buffer;

    try {
      const processor = sharp(file.buffer, {
        limitInputPixels: 25_000_000,
      });

      const metadata = await processor.metadata();

      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp'].includes(metadata.format)
      ) {
        throw new Error('Unsupported image format');
      }

      image = await processor
        .rotate()
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Seleccione una imagen JPEG, PNG o WebP válida.',
      );
    }

    if (image.length > MAX_POSTER_SIZE) {
      throw new PayloadTooLargeException(
        'La imagen procesada supera el máximo de 5 MB.',
      );
    }

    const filename = `${randomUUID()}.webp`;
    const directory = join(IMAGES_DIRECTORY, 'posters');

    await mkdir(directory, { recursive: true });

    await writeFile(
      join(directory, filename),
      image,
      { flag: 'wx' },
    );

    return {
      filename,
      path: `/uploads/posters/${filename}`,
    };
  }
}
