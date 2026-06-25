import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobStatus } from '@cloudforge/shared-config';

export class InvalidStatusTransitionError extends BadRequestException {
  constructor(fromStatus: string, toStatus: string) {
    super(`Cannot transition job status from ${fromStatus} to ${toStatus}`);
    Object.setPrototypeOf(this, InvalidStatusTransitionError.prototype);
  }
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(jobId: string, toStatus: JobStatus) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    const fromStatus = job.status as JobStatus;

    // Terminal state protection: cannot transition from COMPLETE/FAILED/PARTIAL to RUNNING
    const terminalStates = [JobStatus.COMPLETE, JobStatus.FAILED, JobStatus.PARTIAL];
    if (terminalStates.includes(fromStatus) && toStatus === JobStatus.RUNNING) {
      throw new InvalidStatusTransitionError(fromStatus, toStatus);
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: toStatus,
        ...(toStatus === JobStatus.RUNNING ? { startedAt: new Date() } : {}),
        ...(terminalStates.includes(toStatus) ? { completedAt: new Date() } : {}),
      },
    });
  }
}
