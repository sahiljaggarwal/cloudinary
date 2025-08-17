import { Module } from '@nestjs/common';
import { MetadataService } from './meta-data.service';
import { MetaDataController } from './meta-data.controller';
import { AppsService } from 'src/common/config/apps.service';

@Module({
  imports: [],
  providers: [MetadataService, AppsService],
  controllers: [MetaDataController],
})
export class MetaDataModule {}
