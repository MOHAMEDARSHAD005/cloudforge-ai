import { Controller, Get, Param } from '@nestjs/common';
import { JobStatus } from '@cloudforge/shared-config';

@Controller('api/v1/jobs')
export class JobsController {
  @Get(':id')
  getJob(@Param('id') id: string) {
    return {
      id,
      projectId: 'proj-mock-123',
      status: JobStatus.COMPLETE,
      errorMessage: null,
      traceId: 'trace-mock-123',
      startedAt: new Date(Date.now() - 30000).toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  @Get(':id/events')
  getJobEvents(@Param('id') id: string) {
    return [
      {
        id: 'evt-mock-1',
        jobId: id,
        agent: 'planner',
        event: 'agent:complete',
        payload: { durationMs: 12000, modelName: 'claude-sonnet-4-6' },
        timestamp: new Date(Date.now() - 15000).toISOString(),
      },
    ];
  }
}
