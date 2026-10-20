import { Module } from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { CinemasController } from './cinemas.controller';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CinemasController],
  providers: [CinemasService, CinemasRepository],
})
export class CinemasModule {}
