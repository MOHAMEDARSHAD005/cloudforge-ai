import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JobEventsService } from './job-events.service';

@Controller('api/v1/jobs')
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobEventsService: JobEventsService,
  ) {}

  @Get(':id')
  async getJob(@Param('id') id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return job;
  }

  @Get(':id/events')
  async getJobEvents(@Param('id') id: string) {
    const jobExists = await this.prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!jobExists) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return this.jobEventsService.getEventsByJobId(id);
  }
}
