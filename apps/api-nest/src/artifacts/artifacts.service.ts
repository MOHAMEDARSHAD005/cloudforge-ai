import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ArtifactType } from '@cloudforge/shared-config';

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, type: string, payload: any) {
    const schemaVersion = payload.schema_version || '1.0';
    const promptVersion = payload.prompt_version || 'v1';
    const modelName = payload.model_name || 'claude-sonnet-4-6';
    const providerName = payload.provider_name || 'anthropic';

    // Upsert logic: if artifact of this type already exists for the project, update it
    const existing = await this.prisma.artifact.findFirst({
      where: { projectId, type },
    });

    if (existing) {
      return this.prisma.artifact.update({
        where: { id: existing.id },
        data: {
          payload,
          schemaVersion,
          promptVersion,
          modelName,
          providerName,
        },
      });
    }

    return this.prisma.artifact.create({
      data: {
        projectId,
        type,
        payload,
        schemaVersion,
        promptVersion,
        modelName,
        providerName,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.artifact.findUnique({
      where: { id },
    });
  }

  async findByProjectId(projectId: string) {
    return this.prisma.artifact.findMany({
      where: { projectId },
    });
  }

  async findByShareToken(shareToken: string) {
    return this.prisma.artifact.findUnique({
      where: { shareToken },
    });
  }
}
