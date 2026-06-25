import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TokenUsageService } from './token-usage.service';
import { ArtifactsService } from '../artifacts/artifacts.service';

@Injectable()
export class JobEventsService {
  private readonly logger = new Logger(JobEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenUsageService: TokenUsageService,
    private readonly artifactsService: ArtifactsService,
  ) {}

  async write(jobId: string, eventData: {
    event: string;
    agent?: string;
    durationMs?: number;
    tokenUsage?: { input: number; output: number };
    payload?: any;
    error?: string;
    fatal?: boolean;
  }) {
    const { event, agent, payload, tokenUsage } = eventData;

    this.logger.log(`Writing job event: ${event} for job: ${jobId} (agent: ${agent || 'none'})`);

    // 1. Create the JobEvent record
    const jobEvent = await this.prisma.jobEvent.create({
      data: {
        jobId,
        agent: agent || null,
        event,
        payload: {
          durationMs: eventData.durationMs,
          error: eventData.error,
          fatal: eventData.fatal,
        },
      },
    });

    // Get the job to access the projectId
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { projectId: true },
    });

    if (!job) {
      this.logger.error(`Job with ID ${jobId} not found when writing event ${event}`);
      return jobEvent;
    }

    // 2. If agent:complete, persist token usage and artifact
    if (event === 'agent:complete' && agent && payload) {
      const modelName = payload.model_name || 'claude-sonnet-4-6';
      
      if (tokenUsage) {
        await this.tokenUsageService.record(
          jobId,
          agent,
          modelName,
          tokenUsage.input,
          tokenUsage.output,
        );
      }

      // Map agent to artifact type
      let artifactType: string | null = null;
      if (agent === 'planner') artifactType = 'PLAN';
      else if (agent === 'architecture') artifactType = 'ARCHITECTURE';
      else if (agent === 'aws_expert') artifactType = 'AWS_ARCHITECTURE';

      if (artifactType) {
        await this.artifactsService.create(job.projectId, artifactType, payload);
      }
    }

    return jobEvent;
  }

  async getEventsByJobId(jobId: string) {
    return this.prisma.jobEvent.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
