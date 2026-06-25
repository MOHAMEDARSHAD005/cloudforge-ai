import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [QueueModule, JobsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
