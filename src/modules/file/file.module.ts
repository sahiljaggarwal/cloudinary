import { Module } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [QueueModule],
  providers: [FileService],
  controllers: [FileController],
})
export class FileModule {}
