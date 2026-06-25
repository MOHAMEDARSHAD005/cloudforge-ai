import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service';

@Controller('api/v1/artifacts')
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get(':id')
  async getArtifact(@Param('id') id: string) {
    const artifact = await this.artifactsService.findById(id);
    if (!artifact) {
      throw new NotFoundException(`Artifact with ID ${id} not found`);
    }
    return artifact;
  }

  @Get('share/:token')
  async getSharedArtifact(@Param('token') token: string) {
    const artifact = await this.artifactsService.findByShareToken(token);
    if (!artifact) {
      throw new NotFoundException(`Shared artifact with token ${token} not found`);
    }
    return artifact;
  }
}
