import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TokenUsageService {
  constructor(private readonly prisma: PrismaService) {}

  calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
    const modelLower = modelName.toLowerCase();
    let inputRate = 3.0 / 1_000_000;
    let outputRate = 15.0 / 1_000_000;

    if (modelLower.includes('haiku')) {
      inputRate = 0.8 / 1_000_000;
      outputRate = 4.0 / 1_000_000;
    }

    return inputTokens * inputRate + outputTokens * outputRate;
  }

  async record(jobId: string, agent: string, modelName: string, inputTokens: number, outputTokens: number) {
    const costUsd = this.calculateCost(modelName, inputTokens, outputTokens);
    return this.prisma.tokenUsage.create({
      data: {
        jobId,
        agent,
        modelName,
        inputTokens,
        outputTokens,
        costUsd,
      },
    });
  }

  async findByJobId(jobId: string) {
    return this.prisma.tokenUsage.findMany({
      where: { jobId },
    });
  }
}
