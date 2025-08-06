import { Module } from '@nestjs/common';
import { AppsService } from 'src/common/config/apps.service';
import { QueueModule } from '../queues/queue.module';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [QueueModule],
  providers: [FileService, AppsService],
  controllers: [FileController],
})
export class FileModule {}
