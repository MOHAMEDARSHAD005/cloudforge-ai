import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async createProject(@Body() body: { prompt: string }) {
    return this.projectsService.createProject(body.prompt);
  }

  @Get()
  async listProjects() {
    return this.projectsService.listProjects();
  }

  @Get(':id')
  async getProject(@Param('id') id: string) {
    return this.projectsService.getProject(id);
  }

  @Delete(':id')
  async deleteProject(@Param('id') id: string) {
    return this.projectsService.deleteProject(id);
  }
}
