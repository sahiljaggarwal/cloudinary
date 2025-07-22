import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ImageQueue } from './image/image.queue';
import { ImageProcessor } from './image/image.processor';
import { env } from 'src/common/config/env.config';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
    }),
    BullModule.registerQueue({ name: 'image-upload' }),
  ],
  providers: [ImageQueue, ImageProcessor],
  exports: [ImageQueue],
})
export class QueueModule {}
