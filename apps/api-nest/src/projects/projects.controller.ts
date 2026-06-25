import { Controller, Post, Get, Delete, Param, Body, Headers } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async createProject(
    @Body() body: { prompt: string },
    @Headers('x-user-id') userId: string = 'mock-user-123',
  ) {
    const effectiveUserId = userId || 'mock-user-123';
    return this.projectsService.createProject(body.prompt, effectiveUserId);
  }

  @Get()
  async listProjects(@Headers('x-user-id') userId: string = 'mock-user-123') {
    const effectiveUserId = userId || 'mock-user-123';
    return this.projectsService.listProjects(effectiveUserId);
  }

  @Get(':id')
  async getProject(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string = 'mock-user-123',
  ) {
    const effectiveUserId = userId || 'mock-user-123';
    return this.projectsService.getProject(id, effectiveUserId);
  }

  @Delete(':id')
  async deleteProject(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string = 'mock-user-123',
  ) {
    const effectiveUserId = userId || 'mock-user-123';
    return this.projectsService.deleteProject(id, effectiveUserId);
  }
}
