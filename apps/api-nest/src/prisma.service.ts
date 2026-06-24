import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // In Phase 0, we can soft-fail connection if database is not running during local build steps
    try {
      await this.$connect();
    } catch {
      process.stderr.write('Prisma connection deferred: DB may not be running yet.\n');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
