import { z } from 'zod';

// Base metadata fields included in all generated artifacts
export const BaseArtifactSchema = z.object({
  schema_version: z.string().default("1.0"),
  prompt_version: z.string(),
  model_name: z.string(),
  provider_name: z.string(),
  generated_at: z.string(), // ISO String representation of datetime
});

// --- Agent 1: Planner ---
export const ProjectPlanSchema = BaseArtifactSchema.extend({
  system_name: z.string(),
  scale_tier: z.enum(["small", "medium", "large", "enterprise"]),
  primary_use_case: z.string(),
  assumed_user_count: z.number().int(),
  assumed_peak_rps: z.number().int(),
  assumed_regions: z.array(z.string()),
  key_assumptions: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  execution_phases: z.array(z.string()),
  critical_constraints: z.array(z.string()),
  injection_detected: z.boolean().default(false),
});

// --- Agent 2: Architecture ---
export const ServiceComponentSchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  technology: z.string(),
  scales_horizontally: z.boolean(),
  single_point_of_failure: z.boolean(),
});

export const ArchitectureModelSchema = BaseArtifactSchema.extend({
  architecture_pattern: z.string(),
  components: z.array(ServiceComponentSchema),
  database_primary: z.string(),
  database_replica_strategy: z.string(),
  caching_layer: z.string(),
  message_queue: z.string().nullable(),
  cdn_required: z.boolean(),
  ha_strategy: z.string(),
  dr_rto_minutes: z.number().int(),
  dr_rpo_minutes: z.number().int(),
  identified_spofs: z.array(z.string()),
  architecture_decisions: z.array(z.string()),
});

// --- Agent 3: AWS Expert ---
export const AwsServiceSchema = z.object({
  service_name: z.string(),
  purpose: z.string(),
  configuration: z.string(),
  alternatives_considered: z.array(z.string()),
  justification: z.string(),
});

export const AwsArchitectureSchema = BaseArtifactSchema.extend({
  primary_region: z.string(),
  secondary_region: z.string().nullable(),
  vpc_design: z.string(),
  services: z.array(AwsServiceSchema),
  networking_topology: z.string(),
  load_balancer_type: z.string(),
  auto_scaling_strategy: z.string(),
  backup_strategy: z.string(),
  aws_well_architected_notes: z.array(z.string()),
});

// --- Agent 4: Security ---
export const SecurityFindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.string(),
  finding: z.string(),
  recommendation: z.string(),
});

export const SecurityReportSchema = BaseArtifactSchema.extend({
  overall_risk_level: z.enum(["critical", "high", "medium", "low"]),
  iam_recommendations: z.array(z.string()),
  encryption_at_rest: z.array(z.string()),
  encryption_in_transit: z.array(z.string()),
  secrets_management: z.string(),
  network_security: z.array(z.string()),
  waf_recommendations: z.array(z.string()),
  compliance_notes: z.array(z.string()),
  findings: z.array(SecurityFindingSchema),
});

// --- Agent 5: Cost ---
export const CostLineItemSchema = z.object({
  service: z.string(),
  description: z.string(),
  monthly_usd: z.number(),
  assumptions: z.string(),
});

export const CostTierSchema = z.object({
  tier: z.enum(["small", "medium", "large"]),
  description: z.string(),
  line_items: z.array(CostLineItemSchema),
  total_monthly_usd: z.number(),
  total_annual_usd: z.number(),
  primary_cost_driver: z.string(),
});

export const CostModelSchema = BaseArtifactSchema.extend({
  tiers: z.array(CostTierSchema),
  cost_optimization_tips: z.array(z.string()),
  pricing_disclaimer: z.string(),
  reserved_instance_savings_pct: z.number(),
});

// --- Agent 6: Terraform ---
export const TerraformFileSchema = z.object({
  filename: z.string(),
  content: z.string(),
  description: z.string(),
});

export const TerraformBundleSchema = BaseArtifactSchema.extend({
  files: z.array(TerraformFileSchema),
  terraform_version: z.string(),
  provider_versions: z.record(z.string(), z.string()),
  usage_instructions: z.string(),
  known_limitations: z.array(z.string()),
});

// --- Agent 7: Diagram ---
export const DiagramModelSchema = BaseArtifactSchema.extend({
  mermaid_flowchart: z.string(),
  c4_context_diagram: z.string(),
  diagram_notes: z.array(z.string()),
});

// --- Agent 8: Reviewer ---
export const ReviewFindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "suggestion"]),
  category: z.string(),
  finding: z.string(),
  recommendation: z.string(),
  affected_components: z.array(z.string()),
});

export const ReviewReportSchema = BaseArtifactSchema.extend({
  overall_assessment: z.enum(["approved", "approved_with_concerns", "needs_revision", "major_issues"]),
  executive_summary: z.string(),
  strengths: z.array(z.string()),
  findings: z.array(ReviewFindingSchema),
  missing_artifacts: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
  cross_agent_inconsistencies: z.array(z.string()),
});
