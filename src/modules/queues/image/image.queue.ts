import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';

@Injectable()
export class ImageQueue {
  constructor(@InjectQueue('image-upload') private readonly queue: Queue) {}

  async uploadTransformImage(
    file: any,
    folder = 'default',
    fileName: any,
    transformOptions: { height: number; width: number; quality: number },
    apiKey: string,
  ) {
    const job = await this.queue.add('upload-transform', {
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder,
      fileName,
      transformOptions,
      metadata: {
        appId: folder,
        apiKey: apiKey,
      },
    });
    return job;
  }
}
