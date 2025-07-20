import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ImageQueue } from './image/image.queue';
import { ImageProcessor } from './image/image.processor';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue({ name: 'image-upload' }),
  ],
  providers: [ImageQueue, ImageProcessor],
  exports: [ImageQueue],
})
export class QueueModule {}
