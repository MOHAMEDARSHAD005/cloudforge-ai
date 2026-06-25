import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsEventsController } from './jobs-events.controller';
import { JobEventsService } from './job-events.service';
import { TokenUsageService } from './token-usage.service';
import { JobsService } from './jobs.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';

@Module({
  imports: [WebsocketModule, ArtifactsModule],
  controllers: [JobsController, JobsEventsController],
  providers: [JobEventsService, TokenUsageService, JobsService],
  exports: [JobEventsService, TokenUsageService, JobsService],
})
export class JobsModule {}
