import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectQueue('jobs') private readonly jobsQueue: Queue) {}

  async enqueueJob(jobId: string, projectId: string, prompt: string, traceId: string) {
    this.logger.log(`Enqueuing job ${jobId} for project ${projectId} with traceId ${traceId}`);
    
    return this.jobsQueue.add(
      'generate',
      {
        jobId,
        projectId,
        prompt,
        traceId,
      },
      {
        jobId, // ensure idempotency/unique jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s -> 4s -> 8s
        },
        removeOnComplete: true, // Clean up finished jobs
        removeOnFail: false,   // Keep failed jobs for diagnostic/DLQ
      },
    );
  }
}
