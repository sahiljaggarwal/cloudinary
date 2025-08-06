import { Module } from '@nestjs/common';
import { QueueModule } from '../queues/queue.module';
import { MetadataService } from './meta-data.service';
import { MetaDataController } from './meta-data.controller';
import { MetaQueue } from '../queues/meta/meta-data.queue';
import { AppsService } from 'src/common/config/apps.service';

@Module({
  imports: [QueueModule],
  providers: [MetadataService, AppsService],
  controllers: [MetaDataController],
})
export class MetaDataModule {}
