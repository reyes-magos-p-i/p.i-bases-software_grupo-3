import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ImageHandlerService } from './image-handler.service';
import { MAX_POSTER_SIZE } from './image.config';

import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';

@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
@Controller('image-handler')
export class ImageHandlerController {
  constructor(
    private readonly imagesService: ImageHandlerService,
  ) {}

  @Post('posters')
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
