import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';
import { v4 as uuid } from 'uuid';
import { GetFileDto } from './dto/get-file.dto';
import { Readable } from 'stream';
import * as sharp from 'sharp';

@Injectable()
export class FileService {
  private s3 = getS3Client();
  private originalBucket = env.ORIGINAL_BUCKET_NAME;
  private transformedBucket = env.TRANSFORMED_BUCKET_NAME;

  async uploadOriginalFile(file: any) {
    // const folder = uuid();
    const folder = 'default';
    const key = `${folder}/${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.originalBucket,
        Key: key,
        Body: file.buffer,
      }),
    );

    return { key };
  }

  async handleTransformedImage(query: GetFileDto) {
    const { key, height, width, quality } = query;
    console.log('query ', query);
    const transformedKey = this.getTransformedKey(key, height, width, quality);
    console.log('tranformed key ', transformedKey);
    console.log('this.transformedBucket ', this.transformedBucket);
    try {
      console.log('line 43');
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
    console.log('line 54 ');
    const originalImage = await this.s3.send(
      new GetObjectCommand({ Bucket: this.originalBucket, Key: key }),
    );
    console.log('line 58 original image ', !!originalImage);
    const originalBuffer = await this.streamToBuffer(
      originalImage.Body as Readable,
    );
    console.log('line 62 original buffer ', originalBuffer);
    let transformer = sharp(originalBuffer);
    console.log('tranformer ', transformer);
    if (width || height) {
      console.log('height width ', width);
      transformer = transformer.resize(
        width ? +width : undefined,
        height ? +height : undefined,
      );
      console.log('transformer line 71 ', transformer);
    }
    console.log('transformer line 73 ');
    if (quality) {
      console.log('transformer line 75 ', quality);
      transformer = transformer.jpeg({ quality: +quality });
      console.log('transformer line 77 ', transformer);
    }
    const transformedBuffer = await transformer.toBuffer();
    console.log('transformer line 80 ', transformedBuffer);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.transformedBucket,
        Key: transformedKey,
        Body: transformedBuffer,
      }),
    );
    console.log('transformer line 89 ', this.transformedBucket);
    console.log('transformer line 90 ', transformedKey);
    return this.getPresignedUrl(this.transformedBucket, transformedKey);
  }

  private getTransformedKey(
    key: string,
    height?: string,
    width?: string,
    quality?: string,
  ) {
    return `${key}?h=${height}&w=${width}&q=${quality}`;
  }

  private async getPresignedUrl(bucket: string, key: string) {
    const url = `https://${bucket}.s3.amazonaws.com/${key}`;
    console.log('url', url);
    return url;
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
