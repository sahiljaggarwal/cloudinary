// src/queues/meta/meta.queue.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';

@Injectable()
export class MetaQueue {
  constructor(@InjectQueue('meta-update') private readonly metaQueue: Queue) {}

  async addBatchMetadataUpdate(data: {
    jobId: string;
    appName: string;
    newKey: string;
    apiKey: string;
  }) {
    const job = await this.metaQueue.add('batch-metadata-update', data, {
      jobId: data.jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
    return job;
  }

  async getJobById(jobId: string) {
    return await this.metaQueue.getJob(jobId);
  }

  async getJobStatus(jobId: string) {
    const job: Job | null = await this.metaQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState(); // 'waiting' | 'active' | 'completed' | …

    return {
      id: job.id,
      state,
      data: job.data,
      opts: job.opts,
      progress: await job.progress(),
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      failedReason: job.failedReason ?? null,
      returnvalue: job.returnvalue,
      delay: job.opts?.delay ?? 0,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
    };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.metaQueue.getWaiting(),
      this.metaQueue.getActive(),
      this.metaQueue.getCompleted(),
      this.metaQueue.getFailed(),
      this.metaQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }
}
