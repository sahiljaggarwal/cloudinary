import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { AppsService } from 'src/common/config/apps.service';

@Module({
  controllers: [AudioController],
  providers: [AudioService, AppsService],
})
export class AudioModule {}
