import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()  // Global disponibility
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
