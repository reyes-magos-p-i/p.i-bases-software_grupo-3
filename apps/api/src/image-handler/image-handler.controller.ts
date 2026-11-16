import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ImageHandlerService } from './image-handler.service';
import { IMAGES_DIRECTORY, MAX_POSTER_SIZE } from './image.config';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

@Controller('image-handler')
export class ImageHandlerController {
  constructor(private readonly imagesService: ImageHandlerService) {}

  @Get('posters/:filename')
  getPoster(@Param('filename') filename: string, @Res() res: Response) {
    if (
      !filename ||
      filename === '.' ||
      filename === '..' ||
      /[/\\]/.test(filename)
    ) {
      throw new NotFoundException('Poster not found');
    }

    return res.sendFile(filename, {
      root: join(IMAGES_DIRECTORY, 'posters'),
      dotfiles: 'deny',
    });
  }

  @Post('posters')
  @UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_POSTER_SIZE,
        files: 1,
        fields: 0,
      },
    }),
  )
  uploadPoster(@UploadedFile() file?: Express.Multer.File) {
    return this.imagesService.savePoster(file);
  }
}
