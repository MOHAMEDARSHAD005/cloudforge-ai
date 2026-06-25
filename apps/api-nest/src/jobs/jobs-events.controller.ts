import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JobEventsService } from './job-events.service';
import { JobGateway } from '../websocket/job.gateway';
import { ConfigService } from '@nestjs/config';

@Controller('api/v1/jobs')
export class JobsEventsController {
  private readonly logger = new Logger(JobsEventsController.name);

  constructor(
    private readonly jobEventsService: JobEventsService,
    private readonly jobGateway: JobGateway,
    private readonly configService: ConfigService,
  ) {}

  @Post(':jobId/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handleJobEvent(
    @Param('jobId') jobId: string,
    @Headers('x-internal-token') internalToken: string,
    @Body() body: any,
  ) {
    const expectedToken = this.configService.get<string>('INTERNAL_API_SECRET') || 'mock-internal-secret-123';

    if (!internalToken || internalToken !== expectedToken) {
      this.logger.warn(`Unauthorized internal callback attempt for job: ${jobId}`);
      throw new UnauthorizedException('Invalid or missing internal token');
    }

    this.logger.log(`Received agent event for job: ${jobId}, event: ${body.event}`);

    // Write to DB (this handles creating events, and for agent:complete also records token usage & artifacts)
    await this.jobEventsService.write(jobId, body);

    // Emit event via WebSocket to the job's room
    // The events are: agent:started, agent:complete, agent:failed
    this.jobGateway.emitEvent(jobId, body.event, {
      jobId,
      agent: body.agent,
      event: body.event,
      durationMs: body.durationMs,
      payload: body.payload,
      error: body.error,
      fatal: body.fatal,
      timestamp: new Date().toISOString(),
    });
  }
}
