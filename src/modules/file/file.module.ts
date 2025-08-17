import { Module } from '@nestjs/common';
import { AppsService } from 'src/common/config/apps.service';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [],
  providers: [FileService, AppsService],
  controllers: [FileController],
})
export class FileModule {}
