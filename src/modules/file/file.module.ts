import { Module } from '@nestjs/common';
import { FileService } from './file.service';
import { FileController } from './file.controller';
import { QueueModule } from '../queues/queue.module';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [QueueModule],
  providers: [FileService, RedisService],
  controllers: [FileController],
})
export class FileModule {}
