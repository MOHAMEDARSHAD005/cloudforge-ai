import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class JobGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JobGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('job:subscribe')
  handleSubscribe(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;
    if (jobId) {
      client.join(jobId);
      this.logger.log(`Client ${client.id} subscribed to job: ${jobId}`);
      return { status: 'ok', message: `Subscribed to job:${jobId}` };
    }
    return { status: 'error', message: 'Missing jobId' };
  }

  @SubscribeMessage('job:unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;
    if (jobId) {
      client.leave(jobId);
      this.logger.log(`Client ${client.id} unsubscribed from job: ${jobId}`);
      return { status: 'ok', message: `Unsubscribed from job:${jobId}` };
    }
    return { status: 'error', message: 'Missing jobId' };
  }

  emitEvent(jobId: string, eventName: string, data: any) {
    this.logger.log(`Emitting event ${eventName} to job room: ${jobId}`);
    this.server.to(jobId).emit(eventName, data);
  }
}
