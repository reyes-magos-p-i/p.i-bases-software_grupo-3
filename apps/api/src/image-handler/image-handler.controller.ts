import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ImageHandlerService } from './image-handler.service';
import { MAX_POSTER_SIZE } from './image.config';

@Controller('images')
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
