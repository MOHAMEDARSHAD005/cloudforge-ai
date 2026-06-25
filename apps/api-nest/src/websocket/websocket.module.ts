import { Module } from '@nestjs/common';
import { JobGateway } from './job.gateway';

@Module({
  providers: [JobGateway],
  exports: [JobGateway],
})
export class WebsocketModule {}
