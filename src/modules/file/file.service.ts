import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';
import { Readable } from 'stream';
import { GetFileDto } from './dto/get-file.dto';

@Injectable()
export class FileService {
  private s3 = getS3Client();
  private originalBucket = env.ORIGINAL_BUCKET_NAME;
  private transformedBucket = env.TRANSFORMED_BUCKET_NAME;

  async uploadTransformFile(
    file: any,
    appName: string,
    transformOptions: { height: number; width: number; quality: number },
    apiKey: string,
  ) {
    const baseFileName = Date.now();
    const fileName = `${baseFileName}.webp`;
    const job = {
      buffer: file.buffer,
      folder: appName,
      fileName: fileName,
      transformOptions: transformOptions,
      metadata: {
        appId: appName,
        apiKey: apiKey,
      },
    };
    await this.handleUploadOriginal(job);
    return {
      key: `${fileName}`,
    };
  }

  private async handleUploadOriginal(job: any) {
    const { buffer, folder, fileName, transformOptions, metadata } = job;

    const key = `${folder}/${fileName}`;
    try {
      const sharp = require('sharp');
      const transformedBuffer = await sharp(Buffer.from(buffer))
        .resize(transformOptions.width, transformOptions.height)
        .webp({ quality: transformOptions.quality })
        .toBuffer();

      const response = await this.s3.send(
        new PutObjectCommand({
          Bucket: this.transformedBucket,
          Key: key,
          Body: transformedBuffer,
          ContentType: 'image/webp',
          Metadata: {
            'app-id': metadata.appId,
            'api-key': metadata.apiKey,
            'original-height': transformOptions.height.toString(),
            'original-width': transformOptions.width.toString(),
            quality: transformOptions.quality.toString(),
          },
        }),
      );
      console.log('s3 image upload response ', response);
    } catch (error) {
      console.error('s3 image upload error ', error);
    }

    return { key };
  }

  async getOriginalImagesByApiKey(appName: string) {
    const command = new ListObjectsV2Command({
      Bucket: this.originalBucket,
      Prefix: `${appName}/`,
    });

    const result = await this.s3.send(command);

    const keys = result.Contents?.map((obj) => obj.Key) || [];

    return {
      appName,
      files: keys,
    };
  }

  async deleteFile(key: string, apiKey: string, appName: any) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = getS3Client();

    const s3Key = key.includes('/') ? key : `${appName}/${key}`;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.TRANSFORMED_BUCKET_NAME,
        Key: s3Key,
      }),
    );

    return { key: s3Key };
  }

  async getTransformsImagesByApiKey(
    appName: string,
    limit: number,
    continuationToken?: string,
  ) {
    const command = new ListObjectsV2Command({
      Bucket: this.transformedBucket,
      Prefix: `${appName}/`,
      MaxKeys: limit,
      ContinuationToken: continuationToken,
    });

    const result = await this.s3.send(command);

    const keys =
      result.Contents?.map((obj) => ({
        key: obj.Key,
        lastModified: obj.LastModified,
        size: obj.Size,
      })) || [];

    return {
      appName,
      pagination: {
        limit: limit,
        hasNextPage: result.IsTruncated || false,
        nextToken: result.NextContinuationToken,
        itemCount: keys.length,
      },
      files: keys,
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

  getTransformedKey(
    key: string,
    height?: string,
    width?: string,
    quality?: string,
  ) {
    return key;
  }

  private async getPresignedUrl(bucket: string, key: string) {
    return `/api/file/serve/${key}`;
  }

  async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async transformAndUpload(query: GetFileDto): Promise<Buffer> {
    console.log('query ', query);
    console.log(
      'height width quality type ',
      typeof query.height,
      query.width,
      query.quality,
    );
    const { key, height = '0', width = '0', quality = '80' } = query;
    const transformedKey = this.getTransformedKey(key, height, width, quality);

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

    return transformedBuffer;
  }
}
