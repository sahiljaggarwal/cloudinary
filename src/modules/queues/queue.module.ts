import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ImageQueue } from './image/image.queue';
import { ImageProcessor } from './image/image.processor';
import { env } from 'src/common/config/env.config';
import { MetaProcessor } from './meta/meta.processor';
import { MetaQueue } from './meta/meta-data.queue';
import { AppService } from 'src/app.service';
import { AppsService } from 'src/common/config/apps.service';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
    }),
    BullModule.registerQueue({ name: 'image-upload' }),
    BullModule.registerQueue({ name: 'meta-update' }),
  ],
  providers: [
    ImageQueue,
    ImageProcessor,
    MetaProcessor,
    MetaQueue,
    AppsService,
  ],
  exports: [ImageQueue, MetaQueue],
})
export class QueueModule {}
