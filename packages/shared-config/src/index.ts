export enum ProjectStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
  PARTIAL = "PARTIAL",
}

export enum JobStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
  PARTIAL = "PARTIAL",
}

export enum ArtifactType {
  PLAN = "PLAN",
  ARCHITECTURE = "ARCHITECTURE",
  AWS_ARCHITECTURE = "AWS_ARCHITECTURE",
  SECURITY = "SECURITY",
  COST = "COST",
  TERRAFORM = "TERRAFORM",
  DIAGRAM = "DIAGRAM",
  REVIEW = "REVIEW",
}

export const SCHEMA_VERSION = "1.0";

export const AGENT_DEFAULTS = {
  planner: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 2000, maxRetries: 3 },
  architecture: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 3000, maxRetries: 3 },
  awsExpert: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 3000, maxRetries: 3 },
  security: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 2500, maxRetries: 2 },
  cost: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 2500, maxRetries: 2 },
  terraform: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 5000, maxRetries: 2 },
  diagram: { promptVersion: 'v1', model: 'claude-haiku-4-5', maxTokens: 2000, maxRetries: 2 },
  reviewer: { promptVersion: 'v1', model: 'claude-sonnet-4-6', maxTokens: 3000, maxRetries: 3 },
} as const;
