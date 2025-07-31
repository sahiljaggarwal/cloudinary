import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';

@Processor('image-upload')
export class ImageProcessor {
  private s3 = getS3Client();
  private transformBucket = env.TRANSFORMED_BUCKET_NAME;

  @Process('upload-transform')
  async handleUploadOriginal(job: Job) {
    const { buffer, folder, fileName, transformOptions, metadata } = job.data;

    const key = `${folder}/${fileName}`;
    try {
      const sharp = require('sharp');
      const transformedBuffer = await sharp(Buffer.from(buffer.data))
        .resize(transformOptions.width, transformOptions.height)
        .webp({ quality: transformOptions.quality })
        .toBuffer();

      const response = await this.s3.send(
        new PutObjectCommand({
          Bucket: this.transformBucket,
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
    } catch (error) {
      console.error('s3 image upload error ', error);
    }

    return { key };
  }
}
