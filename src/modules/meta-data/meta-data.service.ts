import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getS3Client } from 'src/common/config/aws.config';
import { env } from 'src/common/config/env.config';
import { AppsService } from 'src/common/config/apps.service';

interface QueueJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: any;
  data: any;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retryCount: number;
}

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private readonly BATCH_SIZE = 100;
  private readonly CONCURRENT_BATCHES = 5;
  private readonly MAX_CONCURRENT_JOBS = 3; // Max concurrent jobs
  private readonly MAX_RETRIES = 3;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  private s3 = getS3Client();
  private transformBucket = env.TRANSFORMED_BUCKET_NAME;

  // Proper queue implementation
  private jobs = new Map<string, QueueJob>();
  private pendingQueue: string[] = [];
  private processingJobs = new Set<string>();
  private isProcessing = false;

  constructor(private readonly appsService: AppsService) {
    // Start queue processor
    this.startQueueProcessor();
    // Start cleanup job
    this.startCleanupJob();
  }

  async initiateMetadataUpdate(
    appName: string,
    newKey: string,
    apiKey: string,
  ): Promise<string> {
    const jobId = `metadata_update_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const jobStatus: QueueJob = {
      jobId,
      status: 'pending',
      progress: { step: 'queued', percentage: 0 },
      data: { appName, newKey, apiKey },
      createdAt: new Date(),
      retryCount: 0,
    };

    this.jobs.set(jobId, jobStatus);
    this.pendingQueue.push(jobId);

    this.logger.log(
      `Job ${jobId} added to queue. Queue size: ${this.pendingQueue.length}`,
    );

    return jobId;
  }

  async getUpdateStatus(jobId: string) {
    const jobStatus = this.jobs.get(jobId);

    if (!jobStatus) {
      throw new NotFoundException('Job not found');
    }

    return {
      jobId,
      status: jobStatus.status,
      progress: jobStatus.progress,
      data: jobStatus.data,
      createdAt: jobStatus.createdAt.toISOString(),
      startedAt: jobStatus.startedAt?.toISOString() || null,
      completedAt: jobStatus.completedAt?.toISOString() || null,
      result: jobStatus.result,
      error: jobStatus.error,
      retryCount: jobStatus.retryCount,
      queuePosition: this.pendingQueue.indexOf(jobId) + 1,
      queueSize: this.pendingQueue.length,
      processingJobs: this.processingJobs.size,
    };
  }

  // Get queue statistics
  getQueueStats() {
    return {
      totalJobs: this.jobs.size,
      pendingJobs: this.pendingQueue.length,
      processingJobs: this.processingJobs.size,
      completedJobs: Array.from(this.jobs.values()).filter(
        (j) => j.status === 'completed',
      ).length,
      failedJobs: Array.from(this.jobs.values()).filter(
        (j) => j.status === 'failed',
      ).length,
      maxConcurrency: this.MAX_CONCURRENT_JOBS,
    };
  }

  // Proper queue processor
  private async startQueueProcessor(): Promise<void> {
    setInterval(async () => {
      if (
        this.isProcessing ||
        this.processingJobs.size >= this.MAX_CONCURRENT_JOBS ||
        this.pendingQueue.length === 0
      ) {
        return;
      }

      this.isProcessing = true;

      try {
        while (
          this.pendingQueue.length > 0 &&
          this.processingJobs.size < this.MAX_CONCURRENT_JOBS
        ) {
          const jobId = this.pendingQueue.shift();
          if (jobId && this.jobs.has(jobId)) {
            this.processJob(jobId); // Don't await - run concurrently
          }
        }
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Check every second
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this.processingJobs.add(jobId);
    job.status = 'processing';
    job.startedAt = new Date();
    this.jobs.set(jobId, job);

    try {
      this.logger.log(
        `Processing job ${jobId}. Active jobs: ${this.processingJobs.size}`,
      );

      await this.processMetadataUpdate(
        jobId,
        job.data.appName,
        job.data.newKey,
        job.data.apiKey,
      );
    } catch (error) {
      this.logger.error(`Job ${jobId} failed:`, error);

      job.retryCount++;

      if (job.retryCount < this.MAX_RETRIES) {
        // Add back to queue for retry
        job.status = 'pending';
        this.pendingQueue.push(jobId);
        this.logger.log(
          `Job ${jobId} added back to queue for retry ${job.retryCount}/${this.MAX_RETRIES}`,
        );
      } else {
        // Max retries reached
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();
        job.progress = {
          step: 'failed',
          message: `Update failed after ${this.MAX_RETRIES} retries: ${error.message}`,
          percentage: 0,
          error: error.message,
        };
        this.jobs.set(jobId, job);
      }
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  // Cleanup completed jobs
  private startCleanupJob(): void {
    setInterval(() => {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

      let cleanedCount = 0;
      for (const [jobId, job] of this.jobs.entries()) {
        if (
          (job.status === 'completed' || job.status === 'failed') &&
          job.completedAt &&
          job.completedAt < cutoffTime
        ) {
          this.jobs.delete(jobId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(
          `Cleaned up ${cleanedCount} old jobs. Current jobs: ${this.jobs.size}`,
        );
      }
    }, this.CLEANUP_INTERVAL);
  }

  private async processMetadataUpdate(
    jobId: string,
    appName: string,
    newKey: string,
    apiKey: string,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      // Update job status to processing
      job.progress = {
        step: 'scanning_objects',
        message: 'Scanning S3 objects...',
        percentage: 10,
      };
      this.jobs.set(jobId, job);

      this.logger.log(`Starting batch metadata update for job: ${jobId}`);

      // Get all objects that need updating
      const objectsToUpdate = await this.getObjectsWithOldKey(
        jobId,
        appName,
        apiKey,
      );

      if (objectsToUpdate.length === 0) {
        job.progress = {
          step: 'completed',
          message: 'No objects found to update',
          totalObjects: 0,
          totalProcessed: 0,
          percentage: 100,
        };
        job.status = 'completed';
        job.completedAt = new Date();
        job.result = { totalObjects: 0, totalUpdated: 0, totalFailed: 0 };
        this.jobs.set(jobId, job);

        this.logger.log(`No objects found to update for job: ${jobId}`);
        return;
      }

      this.logger.log(
        `Found ${objectsToUpdate.length} objects to update for job: ${jobId}`,
      );

      job.progress = {
        step: 'processing_updates',
        message: 'Processing metadata updates...',
        totalObjects: objectsToUpdate.length,
        percentage: 20,
      };
      this.jobs.set(jobId, job);

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

        job.progress = {
          step: 'processing_updates',
          message: `Processing batch ${Math.min(i + this.CONCURRENT_BATCHES, batches.length)} of ${batches.length}`,
          totalObjects: objectsToUpdate.length,
          totalProcessed,
          totalUpdated,
          totalFailed,
          currentBatch: Math.min(i + this.CONCURRENT_BATCHES, batches.length),
          totalBatches: batches.length,
          percentage: progressPercentage,
        };
        this.jobs.set(jobId, job);

        // Rate limiting
        if (i + this.CONCURRENT_BATCHES < batches.length) {
          await this.delay(1000);
        }
      }

      // Final progress update
      job.progress = {
        step: 'completed',
        message: 'Metadata update completed successfully',
        totalObjects: objectsToUpdate.length,
        totalProcessed,
        totalUpdated,
        totalFailed,
        percentage: 100,
      };
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = {
        totalObjects: objectsToUpdate.length,
        totalUpdated,
        totalFailed,
      };
      this.jobs.set(jobId, job);

      this.logger.log(
        `Batch metadata update completed for job: ${jobId}. ` +
          `Processed: ${totalProcessed}, Updated: ${totalUpdated}, Failed: ${totalFailed}`,
      );

      // Update app key after successful completion
      this.appsService.updateAppKey(appName, newKey);
    } catch (error) {
      this.logger.error(
        `Batch metadata update failed for job ${jobId}:`,
        error,
      );
      throw error; // Re-throw to trigger retry logic
    }
  }

  private async getObjectsWithOldKey(
    jobId: string,
    appName: string,
    oldKey: string,
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
          const job = this.jobs.get(jobId);
          if (job) {
            job.progress = {
              step: 'scanning_objects',
              message: `Scanned ${scannedCount} objects, found ${objects.length} to update`,
              scannedCount,
              foundCount: objects.length,
              percentage: Math.min(10 + (scannedCount / 50000) * 10, 19),
            };
            this.jobs.set(jobId, job);
          }
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
