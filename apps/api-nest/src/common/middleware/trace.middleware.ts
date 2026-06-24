import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { traceLocalStorage } from '../trace/trace.context';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const traceHeader = req.headers['x-trace-id'] || req.headers['X-Trace-Id'];
    const traceId = (Array.isArray(traceHeader) ? traceHeader[0] : (traceHeader as string)) || uuidv4();
    
    // Set headers on both request and response
    req.headers['x-trace-id'] = traceId;
    res.setHeader('x-trace-id', traceId);

    traceLocalStorage.run({ traceId }, () => {
      next();
    });
  }
}
