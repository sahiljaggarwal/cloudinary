import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';

@Processor('image-upload')
export class ImageProcessor {
  private s3 = getS3Client();
  private originalBucket = env.ORIGINAL_BUCKET_NAME;

  @Process('upload-original')
  async handleUploadOriginal(job: Job) {
    const { buffer, originalname, folder, fileName } = job.data;
    console.log('job data ', buffer, originalname, folder, fileName);

    const key = `${fileName}`;
    try {
      const response = await this.s3.send(
        new PutObjectCommand({
          Bucket: this.originalBucket,
          Key: key,
          Body: Buffer.from(buffer.data),
          ContentType: 'image/webp',
        }),
      );
      console.log('after response ', response);
    } catch (error) {
      console.error('s3 image upload error ', error);
    }

    return { key };
  }
}
