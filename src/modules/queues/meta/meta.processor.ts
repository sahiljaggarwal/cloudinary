// src/queues/meta/meta.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'process';
import { AppsService } from 'src/common/config/apps.service';

@Processor('meta-update')
export class MetaProcessor {
  private readonly logger = new Logger(MetaProcessor.name);
  private readonly BATCH_SIZE = 100;
  private readonly CONCURRENT_BATCHES = 5;
  private s3 = getS3Client();
  private transformBucket = env.TRANSFORMED_BUCKET_NAME;

  constructor(private readonly appsService: AppsService) {}

  @Process('batch-metadata-update')
  async handleBatchMetadataUpdate(job: Job) {
    const { jobId, appName, newKey, apiKey } = job.data;

    try {
      this.logger.log(`Starting batch metadata update for job: ${jobId}`);

      // Update progress - Bull handles this internally
      await job.progress({
        step: 'scanning_objects',
        message: 'Scanning S3 objects...',
        percentage: 10,
      });

      // Get all objects that need updating
      const objectsToUpdate = await this.getObjectsWithOldKey(
        appName,
        apiKey,
        job,
      );

      if (objectsToUpdate.length === 0) {
        await job.progress({
          step: 'completed',
          message: 'No objects found to update',
          totalObjects: 0,
          totalProcessed: 0,
          percentage: 100,
        });

        this.logger.log(`No objects found to update for job: ${jobId}`);
        return { totalObjects: 0, totalUpdated: 0, totalFailed: 0 };
      }

      this.logger.log(
        `Found ${objectsToUpdate.length} objects to update for job: ${jobId}`,
      );

      await job.progress({
        step: 'processing_updates',
        message: 'Processing metadata updates...',
        totalObjects: objectsToUpdate.length,
        percentage: 20,
      });

      // Process in batches
      const batches = this.createBatches(objectsToUpdate, this.BATCH_SIZE);
      let totalProcessed = 0;
      let totalUpdated = 0;
      let totalFailed = 0;

      // Process batches with progress updates
      for (let i = 0; i < batches.length; i += this.CONCURRENT_BATCHES) {
        const currentBatchGroup = batches.slice(i, i + this.CONCURRENT_BATCHES);

        const batchPromises = currentBatchGroup.map((batch, batchIndex) =>
          this.processBatch(batch, apiKey, newKey, i + batchIndex + 1),
        );

        const results = await Promise.allSettled(batchPromises);

        // Calculate results
        results.forEach((result, index) => {
          const batchSize = currentBatchGroup[index].length;
          totalProcessed += batchSize;

          if (result.status === 'fulfilled') {
            totalUpdated += result.value.updated;
            totalFailed += result.value.failed;
          } else {
            totalFailed += batchSize;
            this.logger.error(`Batch ${i + index + 1} failed:`, result.reason);
          }
        });

        // Update progress
        const progressPercentage = Math.min(
          20 + Math.round((totalProcessed / objectsToUpdate.length) * 75),
          95,
        );

        await job.progress({
          step: 'processing_updates',
          message: `Processing batch ${Math.min(i + this.CONCURRENT_BATCHES, batches.length)} of ${batches.length}`,
          totalObjects: objectsToUpdate.length,
          totalProcessed,
          totalUpdated,
          totalFailed,
          currentBatch: Math.min(i + this.CONCURRENT_BATCHES, batches.length),
          totalBatches: batches.length,
          percentage: progressPercentage,
        });

        // Rate limiting
        if (i + this.CONCURRENT_BATCHES < batches.length) {
          await this.delay(1000);
        }
      }

      // Final progress update
      await job.progress({
        step: 'completed',
        message: 'Metadata update completed successfully',
        totalObjects: objectsToUpdate.length,
        totalProcessed,
        totalUpdated,
        totalFailed,
        percentage: 100,
      });

      this.logger.log(
        `Batch metadata update completed for job: ${jobId}. ` +
          `Processed: ${totalProcessed}, Updated: ${totalUpdated}, Failed: ${totalFailed}`,
      );

      this.appsService.updateAppKey(appName, newKey);

      return {
        totalObjects: objectsToUpdate.length,
        totalUpdated,
        totalFailed,
      };
    } catch (error) {
      this.logger.error(
        `Batch metadata update failed for job ${jobId}:`,
        error,
      );

      await job.progress({
        step: 'failed',
        message: `Update failed: ${error.message}`,
        percentage: 0,
        error: error.message,
      });

      throw error;
    }
  }

  private async getObjectsWithOldKey(
    appName: string,
    oldKey: string,
    job: Job,
  ): Promise<string[]> {
    const objects: string[] = [];
    let continuationToken: string | undefined;
    let scannedCount = 0;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.transformBucket,
          Prefix: `${appName}/`,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        });

        const response = await this.s3.send(command);

        if (response.Contents) {
          const checkPromises = response.Contents.map(async (object) => {
            if (object.Key) {
              scannedCount++;
              const hasOldKey = await this.checkObjectMetadata(
                object.Key,
                oldKey,
              );
              return hasOldKey ? object.Key : null;
            }
            return null;
          });

          const results = await Promise.allSettled(checkPromises);
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              objects.push(result.value);
            }
          });
        }

        continuationToken = response.NextContinuationToken;

        // Update scanning progress
        if (scannedCount % 5000 === 0) {
          await job.progress({
            step: 'scanning_objects',
            message: `Scanned ${scannedCount} objects, found ${objects.length} to update`,
            scannedCount,
            foundCount: objects.length,
            percentage: Math.min(10 + (scannedCount / 50000) * 10, 19),
          });
        }
      } while (continuationToken);

      return objects;
    } catch (error) {
      this.logger.error('Error scanning objects:', error);
      throw error;
    }
  }

  private async checkObjectMetadata(
    objectKey: string,
    oldKey: string,
  ): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.transformBucket,
        Key: objectKey,
      });

      const response = await this.s3.send(command);
      return response.Metadata?.['api-key'] === oldKey;
    } catch (error) {
      return false;
    }
  }

  private async processBatch(
    objectKeys: string[],
    oldKey: string,
    newKey: string,
    batchNumber: number,
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    const updatePromises = objectKeys.map(async (objectKey) => {
      try {
        await this.updateObjectMetadata(objectKey, oldKey, newKey);
        updated++;
      } catch (error) {
        this.logger.error(`Failed to update ${objectKey}:`, error.message);
        failed++;
      }
    });

    await Promise.allSettled(updatePromises);
    return { updated, failed };
  }

  private async updateObjectMetadata(
    objectKey: string,
    oldKey: string,
    newKey: string,
  ) {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.transformBucket,
        Key: objectKey,
      });

      const headResponse = await this.s3.send(headCommand);

      if (!headResponse.Metadata) {
        throw new Error(`Object ${objectKey} has no metadata`);
      }

      const updatedMetadata = { ...headResponse.Metadata };
      updatedMetadata['api-key'] = newKey;

      const copyCommand = new CopyObjectCommand({
        Bucket: this.transformBucket,
        CopySource: `${this.transformBucket}/${objectKey}`,
        Key: objectKey,
        Metadata: updatedMetadata,
        MetadataDirective: 'REPLACE',
        ContentType: headResponse.ContentType,
      });

      await this.s3.send(copyCommand);
    } catch (error) {
      throw new Error(
        `Failed to update metadata for ${objectKey}: ${error.message}`,
      );
    }
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
