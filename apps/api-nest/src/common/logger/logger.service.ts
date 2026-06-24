import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import { traceLocalStorage } from '../trace/trace.context';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'api-nest',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      transports: [new winston.transports.Console()],
    });
  }

  private getContext() {
    const store = traceLocalStorage.getStore();
    return {
      traceId: store?.traceId || null,
      jobId: store?.jobId || null,
      projectId: store?.projectId || null,
      userId: store?.userId || null,
    };
  }

  log(message: string, context?: unknown) {
    this.logger.info(message, { ...this.getContext(), context });
  }

  error(message: string, trace?: string, context?: unknown) {
    this.logger.error(message, { ...this.getContext(), context, stack: trace });
  }

  warn(message: string, context?: unknown) {
    this.logger.warn(message, { ...this.getContext(), context });
  }

  debug(message: string, context?: unknown) {
    this.logger.debug(message, { ...this.getContext(), context });
  }

  verbose(message: string, context?: unknown) {
    this.logger.verbose(message, { ...this.getContext(), context });
  }
}
