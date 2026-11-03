import { Module } from '@nestjs/common';
import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';

@Module({
  controllers: [ImageHandlerController],
  providers: [ImageHandlerService]
})
export class ImageHandlerModule {}
