import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';

@Injectable()
export class ImageQueue {
  constructor(@InjectQueue('image-upload') private readonly queue: Queue) {}

  async uploadOriginalImage(
    file: any,
    folder = 'default',
    fileName: any,
    appName: string,
  ) {
    console.log('job start ', folder, fileName, appName);
    const job = await this.queue.add('upload-original', {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      folder,
      fileName,
      appName,
    });
    console.log('✅ Job Added:', job?.id);
    return job;
  }
}
