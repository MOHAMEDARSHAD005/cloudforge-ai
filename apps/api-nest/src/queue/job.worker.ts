import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobEventsService } from '../jobs/job-events.service';
import { JobGateway } from '../websocket/job.gateway';
import { ConfigService } from '@nestjs/config';

@Processor('jobs')
export class JobWorker extends WorkerHost {
  private readonly logger = new Logger(JobWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobEventsService: JobEventsService,
    private readonly jobGateway: JobGateway,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, projectId, prompt, traceId } = job.data;
    this.logger.log(`Processing job ${job.id} (jobId: ${jobId}, projectId: ${projectId})`);

    // 1. Update status to RUNNING in database
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'RUNNING' },
    });

    // 2. Write job:started event and broadcast to room
    await this.jobEventsService.write(jobId, {
      event: 'job:started',
      payload: { attempt: job.attemptsMade + 1 },
    });

    this.jobGateway.emitEvent(jobId, 'job:started', {
      jobId,
      event: 'job:started',
      timestamp: new Date().toISOString(),
    });

    // 3. Call FastAPI /generate endpoint
    const fastApiUrl = this.configService.get<string>('INTERNAL_AI_SERVICE_URL') || 'http://localhost:8000';
    const sharedSecret = this.configService.get<string>('INTERNAL_API_SECRET') || 'mock-internal-secret-123';

    try {
      this.logger.log(`Triggering AI generation via FastAPI at ${fastApiUrl}/generate`);
      const response = await fetch(`${fastApiUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': sharedSecret,
          'X-Trace-Id': traceId || '',
        },
        body: JSON.stringify({
          prompt,
          job_id: jobId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`FastAPI call failed with status ${response.status}: ${errorText}`);

        // Determine if the error is fatal (4xx) or transient (5xx)
        const isFatal = response.status >= 400 && response.status < 500;
        
        await this.handleFailure(jobId, projectId, `HTTP ${response.status}: ${errorText}`, isFatal, job);
      } else {
        const result = await response.json();
        
        // 4. Update status to COMPLETE in database
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETE',
            completedAt: new Date(),
          },
        });

        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'COMPLETE' },
        });

        // 5. Write job:complete event and broadcast
        await this.jobEventsService.write(jobId, {
          event: 'job:complete',
          payload: result,
        });

        this.jobGateway.emitEvent(jobId, 'job:complete', {
          jobId,
          event: 'job:complete',
          timestamp: new Date().toISOString(),
        });

        return result;
      }
    } catch (error: any) {
      this.logger.error(`Connection error to FastAPI /generate: ${error.message}`);
      await this.handleFailure(jobId, projectId, error.message || 'Connection error', false, job);
    }
  }

  private async handleFailure(
    jobId: string,
    projectId: string,
    errorMessage: string,
    isFatal: boolean,
    job: Job,
  ) {
    const attemptsMade = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts || 3;
    const isLastAttempt = attemptsMade >= maxAttempts;

    // Only mark the Job and Project as FAILED in the DB if it is a fatal error OR if it is the last retry attempt.
    if (isFatal || isLastAttempt) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage,
        },
      });

      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'FAILED' },
      });

      await this.jobEventsService.write(jobId, {
        event: 'job:failed',
        error: errorMessage,
        fatal: isFatal,
      });

      this.jobGateway.emitEvent(jobId, 'job:failed', {
        jobId,
        event: 'job:failed',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      if (isFatal) {
        throw new UnrecoverableError(errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    } else {
      // Update error message but keep running for next retry
      await this.prisma.job.update({
        where: { id: jobId },
        data: { errorMessage: `Attempt ${attemptsMade} failed: ${errorMessage}` },
      });

      // Write a temporary failure event
      await this.jobEventsService.write(jobId, {
        event: 'job:failed',
        error: `Attempt ${attemptsMade} failed: ${errorMessage}. Retrying...`,
        fatal: false,
      });

      this.jobGateway.emitEvent(jobId, 'job:failed', {
        jobId,
        event: 'job:failed',
        error: `Attempt ${attemptsMade} failed. Retrying...`,
        timestamp: new Date().toISOString(),
      });

      throw new Error(errorMessage);
    }
  }
}
