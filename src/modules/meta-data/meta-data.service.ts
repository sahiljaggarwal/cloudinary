import { Injectable, NotFoundException } from '@nestjs/common';
import { MetaQueue } from '../queues/meta/meta-data.queue';

@Injectable()
export class MetadataService {
  constructor(private readonly metaQueue: MetaQueue) {}

  async initiateMetadataUpdate(
    appName: string,
    newKey: string,
    apiKey: string,
  ): Promise<string> {
    const jobId = `metadata_update_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    await this.metaQueue.addBatchMetadataUpdate({
      jobId,
      appName,
      newKey,
      apiKey,
    });

    return jobId;
  }

  async getUpdateStatus(jobId: string) {
    const jobStatus = await this.metaQueue.getJobStatus(jobId);

    if (!jobStatus) {
      throw new NotFoundException('Job not found');
    }

    const queueStats = await this.metaQueue.getQueueStats();

    return {
      jobId,
      status: this.getJobState(jobStatus),
      progress: jobStatus.progress,
      data: jobStatus.data,
      createdAt: new Date(jobStatus.timestamp).toISOString(),
      processedAt: jobStatus.processedOn
        ? new Date(jobStatus.processedOn).toISOString()
        : null,
      completedAt: jobStatus.finishedOn
        ? new Date(jobStatus.finishedOn).toISOString()
        : null,
      attempts: jobStatus.attemptsMade,
      error: jobStatus.failedReason,
      queueStats,
    };
  }

  private getJobState(jobStatus: any): string {
    if (jobStatus.finishedOn) {
      return jobStatus.failedReason ? 'failed' : 'completed';
    }
    if (jobStatus.processedOn) {
      return 'processing';
    }
    return 'waiting';
  }
}
