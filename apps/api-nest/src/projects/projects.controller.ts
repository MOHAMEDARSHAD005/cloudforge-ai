import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { ProjectStatus } from '@cloudforge/shared-config';

@Controller('api/v1/projects')
export class ProjectsController {
  @Post()
  createProject(@Body() body: { prompt: string }) {
    const projectId = 'proj-mock-' + Math.random().toString(36).substring(7);
    const jobId = 'job-mock-' + Math.random().toString(36).substring(7);
    return {
      projectId,
      jobId,
      prompt: body.prompt,
      status: ProjectStatus.PENDING,
      createdAt: new Date().toISOString(),
    };
  }

  @Get()
  listProjects() {
    return [
      {
        id: 'proj-mock-1',
        prompt: 'Build a Netflix backend for 10 million users.',
        status: ProjectStatus.COMPLETE,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  @Get(':id')
  getProject(@Param('id') id: string) {
    return {
      id,
      prompt: 'Build a Netflix backend for 10 million users.',
      status: ProjectStatus.COMPLETE,
      createdAt: new Date().toISOString(),
      artifacts: [
        {
          id: 'art-mock-1',
          type: 'PLAN',
          schemaVersion: '1.0',
          promptVersion: 'planner/v1',
          modelName: 'claude-sonnet-4-6',
          providerName: 'anthropic',
          payload: {
            schema_version: '1.0',
            prompt_version: 'planner/v1',
            model_name: 'claude-sonnet-4-6',
            provider_name: 'anthropic',
            generated_at: new Date().toISOString(),
            system_name: 'Netflix Backend Clone',
            scale_tier: 'enterprise',
            primary_use_case: 'Video streaming service',
            assumed_user_count: 10000000,
            assumed_peak_rps: 50000,
            assumed_regions: ['us-east-1', 'eu-west-1'],
            key_assumptions: ['High read workload', 'Geographic distribution'],
            out_of_scope: ['Front-end application development', 'Payment gateway implementation'],
            execution_phases: ['Requirements Analysis', 'Infrastructure Design', 'Review'],
            critical_constraints: ['RTO < 5 minutes', 'Secure IAM control'],
            injection_detected: false,
          },
        },
      ],
    };
  }

  @Delete(':id')
  deleteProject(@Param('id') id: string) {
    return { success: true, message: `Project ${id} deleted successfully` };
  }
}
