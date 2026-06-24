import { Controller, Get, Param } from '@nestjs/common';
import { ArtifactType } from '@cloudforge/shared-config';

@Controller('api/v1/artifacts')
export class ArtifactsController {
  @Get(':id')
  getArtifact(@Param('id') id: string) {
    return {
      id,
      projectId: 'proj-mock-123',
      type: ArtifactType.PLAN,
      schemaVersion: '1.0',
      promptVersion: 'planner/v1',
      modelName: 'claude-sonnet-4-6',
      providerName: 'anthropic',
      createdAt: new Date().toISOString(),
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
    };
  }

  @Get('share/:token')
  getSharedArtifact(@Param('token') token: string) {
    return {
      id: 'art-mock-shared',
      shareToken: token,
      projectId: 'proj-mock-123',
      type: ArtifactType.PLAN,
      schemaVersion: '1.0',
      promptVersion: 'planner/v1',
      modelName: 'claude-sonnet-4-6',
      providerName: 'anthropic',
      createdAt: new Date().toISOString(),
      payload: {
        schema_version: '1.0',
        prompt_version: 'planner/v1',
        model_name: 'claude-sonnet-4-6',
        provider_name: 'anthropic',
        generated_at: new Date().toISOString(),
        system_name: 'Netflix Backend Clone (Shared)',
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
    };
  }
}
