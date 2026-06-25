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

  private async ensureMockUser() {
    return this.prisma.user.upsert({
      where: { id: this.defaultUserId },
      update: {},
      create: {
        id: this.defaultUserId,
        email: 'developer@cloudforge.ai',
        passwordHash: 'argon2-dummy-hash',
      },
    });
  }

  async createProject(prompt: string) {
    this.logger.log(`Creating project with prompt: "${prompt}"`);
    
    // Ensure mock user exists in database to satisfy foreign keys
    await this.ensureMockUser();

    // 1. Create Project and Job records inside a transaction for atomic safety
    const { project, job } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.create({
        data: {
          userId: this.defaultUserId,
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

  async listProjects() {
    this.logger.log('Listing all projects');
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProject(id: string) {
    this.logger.log(`Fetching project: ${id}`);
    const project = await this.prisma.project.findUnique({
      where: { id },
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

  async deleteProject(id: string) {
    this.logger.log(`Deleting project: ${id}`);
    
    // Check project existence
    const project = await this.prisma.project.findUnique({
      where: { id },
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
