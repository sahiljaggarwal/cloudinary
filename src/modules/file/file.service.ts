import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as sharp from 'sharp';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';
import { Readable } from 'stream';
import { ImageQueue } from '../queues/image/image.queue';
import { GetFileDto } from './dto/get-file.dto';

@Injectable()
export class FileService {
  private s3 = getS3Client();
  private originalBucket = env.ORIGINAL_BUCKET_NAME;
  private transformedBucket = env.TRANSFORMED_BUCKET_NAME;

  constructor(private readonly imageQueue: ImageQueue) {}

  async uploadOriginalFile(file: any) {
    const baseFileName = Date.now();
    const fileName = `${baseFileName}.webp`;
    await this.imageQueue.uploadOriginalImage(file, 'default', fileName);
    return {
      key: `${fileName}`,
    };
  }

  async handleTransformedImage(query: GetFileDto) {
    const { key, height = '0', width = '0', quality = '80' } = query;
    const transformedKey = this.getTransformedKey(key, height, width, quality);
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.transformedBucket,
          Key: transformedKey,
        }),
      );
      return this.getPresignedUrl(this.transformedBucket, transformedKey);
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 404) {
        console.log('Transformed image not found, proceeding to transform...');
      } else {
        console.error('line 55 error', error);
        throw error;
      }
    }
    const originalImage = await this.s3.send(
      new GetObjectCommand({ Bucket: this.originalBucket, Key: key }),
    );
    const originalBuffer = await this.streamToBuffer(
      originalImage.Body as Readable,
    );
    let transformer = sharp(originalBuffer);
    if (width || height) {
      transformer = transformer.resize(
        width ? +width : undefined,
        height ? +height : undefined,
      );
    }
    transformer = transformer.webp({ quality: +quality || 80 });
    const transformedBuffer = await transformer.toBuffer();

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.transformedBucket,
        Key: transformedKey,
        Body: transformedBuffer,
        ContentType: 'image/webp',
      }),
    );
    return this.getPresignedUrl(this.transformedBucket, transformedKey);
  }

  async serveFromTransformedDirect(key: string): Promise<Readable> {
    const s3Obj = await this.s3.send(
      new GetObjectCommand({ Bucket: this.transformedBucket, Key: key }),
    );
    return s3Obj.Body as Readable;
  }

  async serveTransformedFile(
    key: string,
    query: GetFileDto,
  ): Promise<Readable> {
    const transformedKey = this.getTransformedKey(
      key,
      query.height,
      query.width,
      query.quality,
    );

    // ensure it exists
    await this.handleTransformedImage(query);

    const s3Obj = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.transformedBucket,
        Key: transformedKey,
      }),
    );
    return s3Obj.Body as Readable;
  }

  private getTransformedKey(
    key: string,
    height?: string,
    width?: string,
    quality?: string,
  ) {
    const ext = path.extname(key);
    const baseName = key.replace(ext, '');
    return `${baseName}_h${height || ''}_w${width || ''}_q${quality || ''}.webp`;
  }

  private async getPresignedUrl(bucket: string, key: string) {
    // const url = `https://${env.TRANSFORMED_CLOUDFRONT_DOMAIN}/${key}`;
    // return url;
    return `/api/file/serve/${key}`;
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
