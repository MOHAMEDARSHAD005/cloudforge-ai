import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { QueueService } from '../queue/queue.service';
import { JobEventsService } from '../jobs/job-events.service';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly defaultUserId = 'mock-user-123';

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly jobEventsService: JobEventsService,
  ) {}

  private async ensureUser(userId: string) {
    return this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@cloudforge.ai`,
        passwordHash: 'argon2-dummy-hash',
      },
    });
  }

  async createProject(prompt: string, userId: string = this.defaultUserId) {
    this.logger.log(`Creating project with prompt: "${prompt}" for user ${userId}`);
    
    // Ensure user exists in database to satisfy foreign keys
    await this.ensureUser(userId);

    // 1. Create Project and Job records inside a transaction for atomic safety
    const { project, job } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.create({
        data: {
          userId: userId,
          prompt,
          status: 'PENDING',
        },
      });

      const job = await tx.job.create({
        data: {
          projectId: project.id,
          status: 'PENDING',
          traceId: `trace-${uuidv4().substring(0, 8)}`,
        },
      });

      return { project, job };
    });

    // 2. Write job:created event
    await this.jobEventsService.write(job.id, {
      event: 'job:created',
      payload: { projectId: project.id, prompt },
    });

    // 3. Enqueue job into BullMQ
    await this.queueService.enqueueJob(job.id, project.id, prompt, job.traceId);

    return {
      projectId: project.id,
      jobId: job.id,
      prompt: project.prompt,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
    };
  }

  async listProjects(userId: string = this.defaultUserId) {
    this.logger.log(`Listing all projects for user ${userId}`);
    return this.prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProject(id: string, userId: string = this.defaultUserId) {
    this.logger.log(`Fetching project: ${id} for user ${userId}`);
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: {
        jobs: true,
        artifacts: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async deleteProject(id: string, userId: string = this.defaultUserId) {
    this.logger.log(`Deleting project: ${id} for user ${userId}`);
    
    // Check project existence and ownership
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Delete related records and project
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete token usages related to jobs
      await tx.tokenUsage.deleteMany({
        where: { job: { projectId: id } },
      });

      // Delete job events
      await tx.jobEvent.deleteMany({
        where: { job: { projectId: id } },
      });

      // Delete jobs
      await tx.job.deleteMany({
        where: { projectId: id },
      });

      // Delete artifacts
      await tx.artifact.deleteMany({
        where: { projectId: id },
      });

      // Delete project
      await tx.project.delete({
        where: { id },
      });
    });

    return { success: true, message: `Project ${id} deleted successfully` };
  }
}
