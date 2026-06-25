import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { JobWorker } from './job.worker';
import { JobsModule } from '../jobs/jobs.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    ConfigModule,
    JobsModule,
    WebsocketModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'jobs',
    }),
  ],
  providers: [QueueService, JobWorker],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
